# Metabase QA DB Tests

These files ensure that Metabase is working with some of the supported databases.

## Running

From the root of the repository:

- If you already have built Metabase with `./bin/build`, just run this to run all the tests.

```shell
#Choose one
yarn run test-cypress-no-build --folder mongo|mysql|postgres

# or run all tests
yarn run test-cypress-no-build --spec ./frontend/test/metabase-db/**/*.cy.spec.js
```

- Active development, add `--open`

### Requirements

Prior to running these tests, please make sure tha you have enabled the `QA_DB_ENABLED` env for that session only.

```bash
QA_DB_ENABLED=true
```

```fish
set -x QA_Db_ENABLED true
```

The list of all supported databases that we currently have Docker images for can be found at [Metabase QA repo](https://github.com/metabase/metabase-qa).

For the convenience, we'll list docker commands here as well:

```shell
#Mongo 4
docker run --rm -p 27017:27017 --name meta-mongo-sample metabase/qa-databases:mongo-sample-4.0

#PostgreSQL 12
docker run --rm -p 5432:5432 --name meta-postgres12-sample metabase/qa-databases:postgres-sample-12

#MySQL 8
docker run --rm -p 3306:3306 --name meta-mysql8-sample metabase/qa-databases:mysql-sample-8
```
