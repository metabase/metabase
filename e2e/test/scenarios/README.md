# Metabase Scenarios

## Metabase QA DB Tests

If you're running Cypress locally and you need to write or run tests for one of the [supported databases](https://github.com/metabase/metabase-qa), make sure you have docker running and start cypress using `yarn-test-cypress-open-qa`.

This will spin up the appropriate DB docker containers and set the `QA_DB_ENABLED` environment variable to `true` and run the tests against the QA databases.

### Requirements

If you would like to set up or troubleshoot local qa db test running locally:

Prior to running these tests:

```bash
QA_DB_ENABLED=true
```

```fish
set -x QA_DB_ENABLED true
```

You will also need to have all QA DB Docker images running, which you can start with `yarn test-qa-dbs:up`, and you can tear them down with `yarn test-qa-dbs:down`.

By omitting the previous step, or explicitly setting `QA_DB_ENABLED` to false, Cypress will skip the snapshot creation phase for the QA databases. In this case, you don't need to have QA DB Docker images running at all.

This all applies to the local development only. CI has all of the supported Docker images running at all times and there's no action needed on your part.
