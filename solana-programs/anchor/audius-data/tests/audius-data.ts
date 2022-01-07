import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import ethWeb3 from "web3";
import {
  createTrack, initAdmin
} from "../lib/lib";
import { findDerivedPair, randomCID } from "../lib/utils";
import { AudiusData } from "../target/types/audius_data";
import { confirmLogInTransaction, initTestConstants, testInitUser, testInitUserSolPubkey } from "./test-helpers";

const { PublicKey } = anchor.web3;

describe("audius-data", () => {
  const provider = anchor.Provider.local("http://localhost:8899", {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  });

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.AudiusData as Program<AudiusData>;
  const EthWeb3 = new ethWeb3();
  const DefaultPubkey = new PublicKey("11111111111111111111111111111111");

  let adminKeypair = anchor.web3.Keypair.generate();
  let adminStgKeypair = anchor.web3.Keypair.generate();

  const testCreateTrack = async ({
    trackMetadata,
    newTrackKeypair,
    userAuthorityKey,
    trackOwnerPDA,
    adminStgKeypair,
  }) => {
    let tx = await createTrack({
      provider,
      program,
      newTrackKeypair,
      userAuthorityKey,
      userStgAccountPDA: trackOwnerPDA,
      metadata: trackMetadata,
      adminStgPublicKey: adminStgKeypair.publicKey,
    });
    await confirmLogInTransaction(provider, tx, trackMetadata);
    let assignedTrackId = await program.account.track.fetch(
      newTrackKeypair.publicKey
    );
    console.log(
      `track: ${trackMetadata}, trackId assigned = ${assignedTrackId.trackId}`
    );
  };

  const testDeleteTrack = async ({
    trackKeypair,
    trackOwnerPDA,
    userAuthorityKey,
  }) => {
    const initialTrackAcctBalance = await provider.connection.getBalance(
      trackKeypair.publicKey
    );
    const initialPayerBalance = await provider.connection.getBalance(
      provider.wallet.publicKey
    );

    await program.rpc.deleteTrack({
      accounts: {
        track: trackKeypair.publicKey,
        user: trackOwnerPDA,
        authority: userAuthorityKey.publicKey,
        payer: provider.wallet.publicKey,
      },
      signers: [userAuthorityKey],
    });

    // Confirm that the account is zero'd out
    // Note that there appears to be a delay in the propagation, hence the retries
    let trackAcctBalance = initialTrackAcctBalance;
    let payerBalance = initialPayerBalance;
    let retries = 20;
    while (trackAcctBalance > 0 && retries > 0) {
      trackAcctBalance = await provider.connection.getBalance(
        trackKeypair.publicKey
      );
      payerBalance = await provider.connection.getBalance(
        provider.wallet.publicKey
      );
      retries--;
    }

    if (trackAcctBalance > 0) {
      throw new Error("Failed to deallocate track");
    }

    console.log(
      `Track acct lamports ${initialTrackAcctBalance} -> ${trackAcctBalance}`
    );
    console.log(
      `Payer acct lamports ${initialPayerBalance} -> ${payerBalance}`
    );
  };

  it("Initializing admin account!", async () => {
    await initAdmin({
      provider: provider,
      program: program,
      adminKeypair: adminKeypair,
      adminStgKeypair: adminStgKeypair,
      trackIdOffset: new anchor.BN("0"),
      playlistIdOffset: new anchor.BN("0"),
    });

    let adminAccount = await program.account.audiusAdmin.fetch(
      adminStgKeypair.publicKey
    );
    if (!adminAccount.authority.equals(adminKeypair.publicKey)) {
      console.log(
        "On chain retrieved admin info: ",
        adminAccount.authority.toString()
      );
      console.log("Provided admin info: ", adminKeypair.publicKey.toString());
      throw new Error("Invalid returned values");
    }
  });

  it("Initializing user!", async () => {
    let { testEthAddr, testEthAddrBytes, handleBytesArray, metadata } =
      initTestConstants();

    let { baseAuthorityAccount, bumpSeed, derivedAddress } =
      await findDerivedPair(
        program.programId,
        adminStgKeypair.publicKey,
        Buffer.from(handleBytesArray)
      );
    let newUserAcctPDA = derivedAddress;

    await testInitUser(
      provider,
      program,
      baseAuthorityAccount,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      bumpSeed,
      metadata,
      newUserAcctPDA,
      adminStgKeypair,
      adminKeypair
    );
  });

  it("Initializing + claiming user!", async () => {
    let {
      pkString,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      metadata,
    } = initTestConstants();

    let { baseAuthorityAccount, bumpSeed, derivedAddress } =
      await findDerivedPair(
        program.programId,
        adminStgKeypair.publicKey,
        Buffer.from(handleBytesArray)
      );
    let newUserAcctPDA = derivedAddress;

    await testInitUser(
      provider,
      program,
      baseAuthorityAccount,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      bumpSeed,
      metadata,
      newUserAcctPDA,
      adminStgKeypair,
      adminKeypair
    );

    // New sol key that will be used to permission user updates
    let newUserKey = anchor.web3.Keypair.generate();

    // Generate signed SECP instruction
    // Message as the incoming public key
    let message = newUserKey.publicKey.toString();

    await testInitUserSolPubkey({
      provider,
      program,
      message,
      pkString,
      newUserKey,
      newUserAcctPDA,
    });
  });

  it("Initializing + claiming + updating user!", async () => {
    let {
      pkString,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      metadata,
    } = initTestConstants();

    let { baseAuthorityAccount, bumpSeed, derivedAddress } =
      await findDerivedPair(
        program.programId,
        adminStgKeypair.publicKey,
        Buffer.from(handleBytesArray)
      );
    let newUserAcctPDA = derivedAddress;

    await testInitUser(
      provider,
      program,
      baseAuthorityAccount,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      bumpSeed,
      metadata,
      newUserAcctPDA,
      adminStgKeypair,
      adminKeypair
    );

    // New sol key that will be used to permission user updates
    let newUserKey = anchor.web3.Keypair.generate();

    // Generate signed SECP instruction
    // Message as the incoming public key
    let message = newUserKey.publicKey.toString();

    await testInitUserSolPubkey({
      provider,
      program,
      message,
      pkString,
      newUserKey,
      newUserAcctPDA,
    });

    let updatedCID = randomCID();
    let tx = await program.rpc.updateUser(updatedCID, {
      accounts: {
        user: newUserAcctPDA,
        userAuthority: newUserKey.publicKey,
      },
      signers: [newUserKey],
    });
    await confirmLogInTransaction(provider, tx, updatedCID);
  });

  it("Initializing + claiming user, creating + updating track", async () => {
    let {
      pkString,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      metadata,
    } = initTestConstants();

    let { baseAuthorityAccount, bumpSeed, derivedAddress } =
      await findDerivedPair(
        program.programId,
        adminStgKeypair.publicKey,
        Buffer.from(handleBytesArray)
      );
    let newUserAcctPDA = derivedAddress;

    await testInitUser(
      provider,
      program,
      baseAuthorityAccount,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      bumpSeed,
      metadata,
      newUserAcctPDA,
      adminStgKeypair,
      adminKeypair
    );

    // New sol key that will be used to permission user updates
    let newUserKey = anchor.web3.Keypair.generate();

    // Generate signed SECP instruction
    // Message as the incoming public key
    let message = newUserKey.publicKey.toString();

    await testInitUserSolPubkey({
      provider,
      program,
      message,
      pkString,
      newUserKey,
      newUserAcctPDA,
    });

    // TODO: Abstract track creation function
    let newTrackKeypair = anchor.web3.Keypair.generate();
    let trackMetadata = randomCID();

    await testCreateTrack({
      trackMetadata,
      newTrackKeypair,
      userAuthorityKey: newUserKey,
      trackOwnerPDA: newUserAcctPDA,
      adminStgKeypair,
    });

    // Expected signature validation failure
    let newTrackKeypair2 = anchor.web3.Keypair.generate();
    let wrongUserKey = anchor.web3.Keypair.generate();
    console.log(`Expecting error with public key ${wrongUserKey.publicKey}`);
    try {
      await testCreateTrack({
        trackMetadata,
        newTrackKeypair: newTrackKeypair2,
        userAuthorityKey: wrongUserKey,
        trackOwnerPDA: newUserAcctPDA,
        adminStgKeypair,
      });
    } catch (e) {
      console.log(`ERROR FOUND AS EXPECTED ${e}`);
    }

    let updatedTrackMetadata = randomCID();
    console.log(`Updating track`);
    let tx3 = await program.rpc.updateTrack(updatedTrackMetadata, {
      accounts: {
        track: newTrackKeypair.publicKey,
        user: newUserAcctPDA,
        authority: newUserKey.publicKey,
        payer: provider.wallet.publicKey,
      },
      signers: [newUserKey],
    });
    await confirmLogInTransaction(provider, tx3, updatedTrackMetadata);
  });

  it("creating + deleting a track", async () => {
    let {
      pkString,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      metadata,
    } = initTestConstants();

    let { baseAuthorityAccount, bumpSeed, derivedAddress } =
      await findDerivedPair(
        program.programId,
        adminStgKeypair.publicKey,
        Buffer.from(handleBytesArray)
      );
    let newUserAcctPDA = derivedAddress;

    await testInitUser(
      provider,
      program,
      baseAuthorityAccount,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      bumpSeed,
      metadata,
      newUserAcctPDA,
      adminStgKeypair,
      adminKeypair
    );

    // New sol key that will be used to permission user updates
    let newUserKey = anchor.web3.Keypair.generate();

    // Generate signed SECP instruction
    // Message as the incoming public key
    let message = newUserKey.publicKey.toString();

    await testInitUserSolPubkey({
      provider,
      program,
      message,
      pkString,
      newUserKey,
      newUserAcctPDA,
    });

    let newTrackKeypair = anchor.web3.Keypair.generate();

    let trackMetadata = randomCID();
    await testCreateTrack({
      trackMetadata,
      newTrackKeypair,
      userAuthorityKey: newUserKey,
      trackOwnerPDA: newUserAcctPDA,
      adminStgKeypair,
    });

    await testDeleteTrack({
      trackKeypair: newTrackKeypair,
      trackOwnerPDA: newUserAcctPDA,
      userAuthorityKey: newUserKey,
    });
  });

  it("create multiple tracks in parallel", async () => {
    let {
      pkString,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      metadata,
    } = initTestConstants();

    let { baseAuthorityAccount, bumpSeed, derivedAddress } =
      await findDerivedPair(
        program.programId,
        adminStgKeypair.publicKey,
        Buffer.from(handleBytesArray)
      );
    let newUserAcctPDA = derivedAddress;

    await testInitUser(
      provider,
      program,
      baseAuthorityAccount,
      testEthAddr,
      testEthAddrBytes,
      handleBytesArray,
      bumpSeed,
      metadata,
      newUserAcctPDA,
      adminStgKeypair,
      adminKeypair
    );

    // New sol key that will be used to permission user updates
    let newUserKey = anchor.web3.Keypair.generate();

    // Generate signed SECP instruction
    // Message as the incoming public key
    let message = newUserKey.publicKey.toString();

    await testInitUserSolPubkey({
      provider,
      program,
      message,
      pkString,
      newUserKey,
      newUserAcctPDA,
    });

    let newTrackKeypair = anchor.web3.Keypair.generate();
    let newTrackKeypair2 = anchor.web3.Keypair.generate();
    let newTrackKeypair3 = anchor.web3.Keypair.generate();
    let trackMetadata = randomCID();
    let trackMetadata2 = randomCID();
    let trackMetadata3 = randomCID();
    let start = Date.now();
    await Promise.all([
      testCreateTrack({
        trackMetadata,
        newTrackKeypair,
        adminStgKeypair,
        userAuthorityKey: newUserKey,
        trackOwnerPDA: newUserAcctPDA,
      }),
      testCreateTrack({
        trackMetadata: trackMetadata2,
        adminStgKeypair,
        newTrackKeypair: newTrackKeypair2,
        userAuthorityKey: newUserKey,
        trackOwnerPDA: newUserAcctPDA,
      }),
      testCreateTrack({
        trackMetadata: trackMetadata3,
        adminStgKeypair,
        newTrackKeypair: newTrackKeypair3,
        userAuthorityKey: newUserKey,
        trackOwnerPDA: newUserAcctPDA,
      }),
    ]);
    console.log(`Created 3 tracks in ${Date.now() - start}ms`);
  });
});
