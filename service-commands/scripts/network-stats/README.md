# Setup

Visit audius.co and run the following command in the console:

```
await audiusLibs.ethContracts.ServiceProviderFactoryClient.getServiceProviderList('discovery-node')
```

Copy the output to `service_provider_list.json`.

Install dependencies:

```
pip3 install -r requirements.txt
```

 // https://github.com/AudiusProject/audius-protocol/wiki/Discovery-Node:-Architecture

# Tracing the Database Read/Write Path for Tracks

The [`db` instance](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/app.py#L506-L508) is created using the [`SessionManager` object](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/utils/session_manager.py).

When [new track information](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/tasks/tracks.py#L74) is seen within the blockchain, we update or create a [`Track` object](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/tasks/tracks.py#L143-L162).

When a `GET` request on [`/tracks` occurs](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/queries/queries.py#L95), a series of filters are applied to the [`_get_tracks()` helper function](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/queries/get_tracks.py#L42).

For tracks, [`TrackRoute`](https://github.com/AudiusProject/audius-protocol/blob/32c4e9003aaeb2f827191f088bd7492012ec7ed9/discovery-provider/src/models/track_route.py#L22) and [`Track`](https://github.com/AudiusProject/audius-protocol/blob/025f2f35e270335baf320de9d1bee82c37408ffe/discovery-provider/src/models/models.py#L312) use the `sqlalchemy` ORM.

When a request is submitted, [pagination](https://github.com/AudiusProject/audius-protocol/blob/025f2f35e270335baf320de9d1bee82c37408ffe/discovery-provider/src/queries/query_helpers.py#L996) may occur before the data is [remapped to a `list` of `dicts`](https://github.com/AudiusProject/audius-protocol/blob/025f2f35e270335baf320de9d1bee82c37408ffe/discovery-provider/src/utils/helpers.py#L140).

## Cassandra

After thinking about it more, Cassandra may be the best solution to match all the stated goals. I realized that since each node scans the same blockchain, Cassandra's optimized replication isn't important, only redundancy as a way to bootstrap new nodes into the cluster and thereby horizontally scale. We also won't need strong consistency through replication either since each node is scanning the blockchain, thereby leaving only the failure detector to be worked on for client-side requests.

We can make the Cassandra cluster work when it comes to:

*  security, via SSH tunnels
*  horizontal linear scale, via Cassandra
*  freeing up resources, via removing joins
*  bootstrap/decommission processes, via Cassandra
*  redundancy, via Cassandra
*  immediate consistency, since each node scans its own data
*  clusterwide consistency, for certain critical data like max_blockheight

We would need to:

* Create new ConsistencyLevels.
* Tune the failure detector.
* Run seperate clusters, never interlinked data centers, to protect from the lack of immutability introduced by data corruption and/or bad actors who have gained access to any system in a cluster.
* Setup metrics/alerting, like Wikipedia.
* Monitor and remove unhealthy nodes.
* Update configs remotely.
* Setup Reaper for consistency alerting, not primarily repairs.
* Denormalize our read patterns.
* Setup map/reduce jobs on denormalized data.
