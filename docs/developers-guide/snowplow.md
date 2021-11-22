# Snowplow integration

Metabase uses [Snowplow](https://snowplowanalytics.com/) and [SnowcatCloud](https://www.snowcatcloud.com/) for
collecting analytics data. We only send events when `Anonymous tracking` is enabled. We do not record personal
identifiable information with the events.

## How to test events manually

We use [Snowplow Micro](https://github.com/snowplow-incubator/snowplow-micro) for end-to-end tests.

1. Run `docker compose up` inside `/snowplow` folder to spin up a local instance.
2. Start Metabase with `MB_SNOWPLOW_AVAILABLE=true` and anonymous tracking enabled.
3. Recorded events are available at `http://localhost:9090/micro/`.

## How to test events with Cypress

Our end-to-end testing environment has been configured to run Snowplow Micro alongside the application.

1. Use `describeWithSnowplow` method to define tests that only run when a Snowplow instance is running, for instance, on
   CI or locally with `MB_SNOWPLOW_AVAILABLE`.
2. Use `resetSnowplow()` test helper before each test to clear the queue of processed events.
3. Use `expectGoodSnowplowEvents(count)` to assert that events have been sent and processed correctly.
4. Use `expectNoBadSnowplowEvents()` after each test to assert that no invalid events have been sent.

Cypress end-to-end tests is the only way we use to test Snowplow changes automatically.

## How to add a new event

1. Add a json schema for the event. Schemas live inside the `/snowplow/iglu-client-embedded/schemas` folder. Use an
   existing schema for reference. A new event will always have `1-0-0` version.
2. Send this event in the application. On the frontend, use `trackSchemaEvent(schema, version, data)`.
3. Add a Cypress test that verifies that the event has been processed correctly. The test should at least
   have `expectNoBadSnowplowEvents` assertion.
4. When the PR gets merged, publish the schema at https://www.snowcatcloud.com/.
5. Create the corresponding Redshift table. Currently, the only way to do this is to write an email to SnowcatCloud.

## How to modify an existing event

1. Pick a new version for the event. It's `major-minor-patch`, where:

- `patch` represents backward-compatible schema changes. For example, adding a new nullable field.
- `minor` represents backward-incompatible changes when existing clients can send events for previous schema revisions
  into the same Redshift table. For example, adding a non-nullable field which is mapped to a nullable column in the
  database.
- `major` represents backward-incompatible changes when a new Redshift table should be created.

2. Follow the same steps as for adding a new event.
