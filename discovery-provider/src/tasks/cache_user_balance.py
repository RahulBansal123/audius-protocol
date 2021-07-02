import logging
import time
from sqlalchemy import and_
from src.app import eth_abi_values
from src.tasks.celery_app import celery
from src.models import UserBalance, User, AssociatedWallet
from src.queries.get_balances import does_user_balance_need_refresh, REDIS_PREFIX
from src.utils.redis_constants import user_balances_refresh_last_completion_redis_key

logger = logging.getLogger(__name__)
audius_token_registry_key = bytes("Token", "utf-8")
audius_staking_registry_key = bytes("StakingProxy", "utf-8")
audius_delegate_manager_registry_key = bytes("DelegateManager", "utf-8")

REDIS_ETH_BALANCE_COUNTER_KEY = "USER_BALANCE_REFRESH_COUNT"

# *Explanation of user balance caching*
# In an effort to minimize eth calls, we look up users embedded in track metadata once per user,
# and current users (logged in dapp users, who might be changing their balance) on an interval.
#
# - In populate_user_metadata, look up User_Balance entry in db.
#       If it doesn't exist, return 0, persist a User_Balance row with 0,
#       & enqueue in Redis the user ID for later balance lookup.
# - On track get endpoints, if current_user exists, enqueue balance lookup
#       in Redis.
#
# In this recurring task:
#   - Get all enqueued user balance refresh requests. These are stored in a set, so
#       we don't worry about deduping.
#   - If a given balance is either
#        a) new (created_at == updated_at)
#        b) not new, but stale: last updated prior to (now - threshold)
#     we look up said users, adding User_Balance rows, and removing them from Redis.
#     Users with zero balance are refreshed at a slower rate than users with a non-zero balance.
#
#     enqueued User Ids in Redis that are *not* ready to be refreshed yet are left in the queue
#     for later.

def refresh_user_ids(redis, db, token_contract, delegate_manager_contract, staking_contract, eth_web3):
    # List users in Redis set, balances decoded as strings
    redis_user_ids = redis.smembers(REDIS_PREFIX)
    redis_user_ids = [int(user_id.decode()) for user_id in redis_user_ids]

    if not redis_user_ids:
        return

    logger.info(f"cache_user_balance.py | Starting refresh with {len(redis_user_ids)} user_ids: {redis_user_ids}")

    with db.scoped_session() as session:
        query = ((
            session.query(UserBalance)
        ).filter(
            UserBalance.user_id.in_(redis_user_ids)
        ).all())

        # Balances from current user lookup may
        # not be present in the db, so make those
        not_present_set = {user_id for user_id in redis_user_ids} - {user.user_id for user in query}
        new_balances = [
            UserBalance(user_id=user_id, balance=0, associated_wallets_balance=0)
            for user_id in not_present_set
        ]
        if new_balances:
            session.add_all(new_balances)
            logger.info(f"cache_user_balance.py | adding new users: {not_present_set}")

        # Filter only user_balances that still need refresh
        needs_refresh = list(filter(does_user_balance_need_refresh, query))
        needs_refresh += new_balances

        # map user_id -> user_balance
        needs_refresh_map = {user.user_id: user for user in needs_refresh}

        # Grab the users & associated_wallets we need to refresh
        user_query = (
            session.query(User.user_id, User.wallet, AssociatedWallet.wallet)
            .outerjoin(
                AssociatedWallet,
                and_(
                    AssociatedWallet.user_id == User.user_id,
                    AssociatedWallet.is_current == True,
                    AssociatedWallet.is_delete == False
                )
            )
            .filter(
                User.user_id.in_(needs_refresh_map.keys()),
                User.is_current == True,
            ).all()
        )
        user_id_wallets = {}
        for user in user_query:
            user_id, user_wallet, associated_wallet = user
            if not user_id in user_id_wallets:
                user_id_wallets[user_id] = {"owner_wallet": user_wallet}
            if associated_wallet:
                if not "associated_wallets" in user_id_wallets[user_id]:
                    user_id_wallets[user_id]["associated_wallets"] = [associated_wallet]
                else:
                    user_id_wallets[user_id]["associated_wallets"].append(associated_wallet)

        logger.info(f"cache_user_balance.py | fetching for {len(user_query)} users: {needs_refresh_map.keys()}")

        # Fetch balances
        for user_id, wallets in user_id_wallets.items():
            try:
                owner_wallet = wallets["owner_wallet"]
                owner_wallet = eth_web3.toChecksumAddress(owner_wallet)
                owner_wallet_balance = token_contract.functions.balanceOf(owner_wallet).call()
                associated_balance = 0

                if "associated_wallets" in wallets:
                    for wallet in wallets["associated_wallets"]:
                        wallet = eth_web3.toChecksumAddress(wallet)
                        balance = token_contract.functions.balanceOf(wallet).call()
                        delegation_balance = delegate_manager_contract.functions.getTotalDelegatorStake(wallet).call()
                        stake_balance = staking_contract.functions.totalStakedFor(wallet).call()
                        associated_balance += balance + delegation_balance + stake_balance

                # update the balance on the user model
                user_balance = needs_refresh_map[user_id]
                user_balance.balance = owner_wallet_balance
                user_balance.associated_wallets_balance = associated_balance

            except Exception as e:
                logger.error(f"cache_user_balance.py | Error fetching balance for user {user_id}: {(e)}")

        # Commit the new balances
        session.commit()

        # Remove the fetched balances from Redis set
        to_remove = [user.user_id for user in needs_refresh]
        logger.info(f"cache_user_balance.py | Got balances for {len(user_query)} users, removing from Redis.")
        if to_remove:
            redis.srem(REDIS_PREFIX, *to_remove)
            # Add the count of the balances
            redis.incrby(REDIS_ETH_BALANCE_COUNTER_KEY, len(to_remove))

def get_token_contract(eth_web3, shared_config):
    eth_registry_address = eth_web3.toChecksumAddress(
        shared_config["eth_contracts"]["registry"]
    )

    eth_registry_instance = eth_web3.eth.contract(
        address=eth_registry_address, abi=eth_abi_values["Registry"]["abi"]
    )

    token_address = eth_registry_instance.functions.getContract(
        audius_token_registry_key
    ).call()

    audius_token_instance = eth_web3.eth.contract(
        address=token_address, abi=eth_abi_values["AudiusToken"]["abi"]
    )

    return audius_token_instance

def get_delegate_manager_contract(eth_web3, shared_config):
    eth_registry_address = eth_web3.toChecksumAddress(
        shared_config["eth_contracts"]["registry"]
    )

    eth_registry_instance = eth_web3.eth.contract(
        address=eth_registry_address, abi=eth_abi_values["Registry"]["abi"]
    )

    delegate_manager_address = eth_registry_instance.functions.getContract(
        audius_delegate_manager_registry_key
    ).call()

    delegate_manager_instance = eth_web3.eth.contract(
        address=delegate_manager_address, abi=eth_abi_values["DelegateManager"]["abi"]
    )

    return delegate_manager_instance

def get_staking_contract(eth_web3, shared_config):
    eth_registry_address = eth_web3.toChecksumAddress(
        shared_config["eth_contracts"]["registry"]
    )

    eth_registry_instance = eth_web3.eth.contract(
        address=eth_registry_address, abi=eth_abi_values["Registry"]["abi"]
    )

    staking_address = eth_registry_instance.functions.getContract(
        audius_staking_registry_key
    ).call()

    staking_instance = eth_web3.eth.contract(
        address=staking_address, abi=eth_abi_values["Staking"]["abi"]
    )

    return staking_instance

@celery.task(name="update_user_balances", bind=True)
def update_user_balances_task(self):
    """Caches user Audio balances, in wei."""

    db = update_user_balances_task.db
    redis = update_user_balances_task.redis
    eth_web3 = update_user_balances_task.eth_web3
    shared_config = update_user_balances_task.shared_config

    have_lock = False
    update_lock = redis.lock("update_user_balances_lock", timeout=7200)

    try:
        have_lock = update_lock.acquire(blocking=False)

        if have_lock:
            start_time = time.time()

            token_inst = get_token_contract(eth_web3, shared_config)
            delegate_manager_inst = get_delegate_manager_contract(eth_web3, shared_config)
            staking_inst = get_staking_contract(eth_web3, shared_config)
            token_inst = get_token_contract(eth_web3, shared_config)
            refresh_user_ids(redis, db, token_inst, delegate_manager_inst, staking_inst, eth_web3)

            end_time = time.time()
            redis.set(user_balances_refresh_last_completion_redis_key, int(end_time))
            logger.info(f"cache_user_balance.py | Finished cache_user_balance in {end_time - start_time} seconds")
        else:
            logger.info("cache_user_balance.py | Failed to acquire lock")
    except Exception as e:
        logger.error("cache_user_balance.py | Fatal error in main loop", exc_info=True)
        raise e
    finally:
        if have_lock:
            update_lock.release()
