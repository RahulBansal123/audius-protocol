
from typing import TypedDict
from sqlalchemy.orm.session import Session
from src.models import Play, Track
from src.models.models import UserListeningHistory
from src.utils import helpers
from src.utils.db_session import get_db_read_replica
from src.queries import response_name_constants
from src.queries.query_helpers import (
    populate_track_metadata,
    add_users_to_tracks,
)

class GetUserListeningHistory(TypedDict):
    current_user_id: int
    limit: int
    offset: int
    filter_deleted: bool
    with_users: bool

def get_user_listening_history(args: GetUserListeningHistory):
    db = get_db_read_replica()
    with db.scoped_session() as session:
        return _get_user_listening_history(session, args)


def add_query_pagination(listening_history, limit, offset):
    return

def _get_user_listening_history(session: Session, args: GetUserListeningHistory):
    current_user_id = args.get("current_user_id")
    limit = args.get("limit")
    offset = args.get("offset")
    filter_deleted = args.get("filter_deleted")

    listening_history_results = (
        session.query(UserListeningHistory.listening_history)
        .filter(
            UserListeningHistory.user_id == current_user_id
        )
    ).scalar()

    # query_result = add_query_pagination(listening_history_results, limit, offset).all()

    if not listening_history_results:
        return []

    track_ids = []
    listen_dates = []
    for listen in listening_history_results:
        track_ids.append(listen["track_id"])
        listen_dates.append(listen["timestamp"])

    tracks_results = (
        session.query(Track)
        .filter(
            Track.track_id.in_(track_ids)
        )
    ).all()

    # bundle peripheral info into track results
    tracks = populate_track_metadata(session, track_ids, tracks_results, current_user_id)

    if args.get("with_users", False):
        add_users_to_tracks(session, tracks, current_user_id)

    for idx, track in enumerate(tracks):
        track[response_name_constants.activity_timestamp] = listen_dates[idx]

    return tracks
