# Metabase Scenarios

## Running

- If you are running tests that include `alert > email_alert`, run `docker run -p 80:80 -p 25:25 maildev/maildev:1.1.0` in terminal first for setting up email through your localhost

## Metabase QA DB Tests

If you're running Cypress locally and you need to write or run tests for one of the [supported databases](https://github.com/metabase/metabase-qa), please make sure that you have `QA_DB_ENABLED` env for that session only. 

### Requirements

Prior to running these tests:

```bash
QA_DB_ENABLED=true
```

```fish
set -x QA_DB_ENABLED true
```


You will also need to have all QA DB Docker images running. For the convenience, we'll list docker commands here as well:

```shell
#Mongo 4
docker run --rm -p 27017:27017 --name meta-mongo4-sample metabase/qa-databases:mongo-sample-4.0

#PostgreSQL 12
docker run --rm -p 5432:5432 --name meta-postgres12-sample metabase/qa-databases:postgres-sample-12

#MySQL 8
docker run --rm -p 3306:3306 --name meta-mysql8-sample metabase/qa-databases:mysql-sample-8
```

By omitting the previous step, or explicitly setting `QA_DB_ENABLED` to false, Cypress will skip the snapshot creation phase for the QA databases. In this case, you don't need to have QA DB Docker images running at all.

This all applies to the local development only. CI has all of the supported Docker images running at all times and there's no action needed on your part.

