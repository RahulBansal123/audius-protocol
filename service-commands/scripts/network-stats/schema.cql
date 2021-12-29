CREATE KEYSPACE IF NOT EXISTS audius
  WITH replication = {'class': 'NetworkTopologyStrategy', 'audius': 1 };

CREATE TABLE IF NOT EXISTS audius.tracks (
  track_id int,

  update_time timeuuid,
  blockhash text,
  txhash text,

  is_current boolean,

  PRIMARY KEY ((track_id), update_time, blockhash, txhash)
) WITH CLUSTERING ORDER BY (blockhash DESC, txhash DESC)
  AND comment = 'Source of truth for tracks.';

CREATE TABLE IF NOT EXISTS audius.tracks_by_creator (
  creator_id int,

  slug text,

  track_id int,
  # is_current boolean, wouldn't matter here

  PRIMARY KEY ((creator_id), slug)
) WITH comment = 'Denormalized table for tracks by creator.';

CREATE TABLE IF NOT EXISTS audius.tracks_by_play (
  date date,
  track_id int,

  block_id int,
  play_time timeuuid,

  PRIMARY KEY ((date, track_id), block_id, play_time)
) WITH CLUSTERING ORDER BY (play_time DESC)
  AND default_time_to_live = 2592000
  AND compaction = {'compaction_window_size': '1',
                    'compaction_window_unit': 'MINUTES',
                    'class': 'org.apache.cassandra.db.compaction.TimeWindowCompactionStrategy'}
  AND comment = 'Source of truth for track plays.';

CREATE TABLE IF NOT EXISTS audius.plays_ts (
  block_id int,

  track_id int,

  PRIMARY KEY ((block_id), track_id)
) WITH default_time_to_live = 2592000
  AND compaction = {'compaction_window_size': '1',
                    'compaction_window_unit': 'MINUTES',
                    'class': 'org.apache.cassandra.db.compaction.TimeWindowCompactionStrategy'}
  AND comment = 'Ledger for which plays need to be recomputed.';

