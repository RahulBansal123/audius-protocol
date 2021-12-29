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

