---
title: Submitting a PR for a new driver
---

# Submitting a PR for a new driver

If you want to submit a PR to add a driver plugin to the [Metabase repo](https://github.com/metabase/metabase) (as opposed to keeping it in a separate repo), you'll need to:

- Be able to run your database locally with Docker.
- Make sure your driver passes Metabase's core test suite.

## Testing your driver

To test your driver, you'll need to:

- Move your plugin into the [`modules/drivers`](https://github.com/metabase/metabase/tree/master/modules/drivers) directory in the Metabase repository.
- Add _test extensions_ to your driver.
- Edit [`.github/workflows/drivers.yml`](https://github.com/metabase/metabase/blob/master/.github/workflows/drivers.yml) to tell GitHub Actions how to set up a Docker image for your database and run tests against it.

## Add test extensions to your driver

Test extensions do things like create new databases and load data for given _database definitions_. Metabase defines a huge suite of tests that automatically run against all drivers, including your new driver.

To run the test suite with your driver, you'll need to write a series of method implementations for special _test extension_ multimethods. Test extensions do things like create new databases and load data for _database definitions_.

These test extensions will tell Metabase how to create new databases and load them with test data, and provide information about what Metabae can expect from the created database. Test extensions are simply additional multimethods used only by tests. Like the core driver multimethods, they dispatch on the driver name as a keyword, e.g. `:mysql`.

## File organization

Test extensions for a driver usually live in a namespace called `metabase.test.data.<driver>`. If your driver is for SQLite, your files should look something like:

```clj
metabase/modules/drivers/sqlite/deps.edn                           ; <- deps go in here
metabase/modules/drivers/sqlite/resources/metabase-plugin.yaml     ; <- plugin manifest
metabase/modules/drivers/sqilte/src/metabase/driver/sqlite.clj     ; <- main driver namespace
```

So you'll create a new directory and file to house your text extension method implementations.

```clj
metabase/modules/drivers/sqlite/test/metabase/test/data/sqlite.clj   ; <- test extensions
```

## Where are test extension methods defined?

Metabase test extensions live in the [`metabase.test.data.interface`](https://github.com/metabase/metabase/blob/master/test/metabase/test/data/interface.clj) namespace. Like the core driver methods, `:sql` and `:jdbc-sql` implement some of the test extensions themselves, but define additional methods you must implement to use them; see the [`metabase.test.data.sql`](https://github.com/metabase/metabase/blob/master/test/metabase/test/data/sql.clj)
and [`metabase.test.data.sql-jdbc`](https://github.com/metabase/metabase/blob/master/test/metabase/test/data/sql_jdbc.clj) namespaces.

You'll need to require the following namespaces, aliased like so:

```clj
(require '[metabase.test.data.interface :as tx]) ; tx = test extensions
(require '[metabase.test.data.sql :as sql.tx])   ; sql test extensions
(require '[metabase.test.data.sql-jdbc :as sql-jdbc.tx])
```

## Registering test extensions

Like the driver itself, you need to register the fact that your driver has test extensions, so Metabase knows it doesn't need to try to load them a second time. (If they're not loaded yet, Metabase will load them when needed by looking for a namespace named `metabase.test.data.<driver>`, which is why you need to follow that naming pattern.) The `:sql` and `:sql-jdbc` drivers have their own sets of test extensions, so depending on which parent you're using for your driver, register test extensions with:

```clj
# Non-SQL drivers
(tx/add-test-extensions! :mongo)

# non-JDBC SQL
(sql/add-test-extensions! :bigquery)

# JDBC SQL
(sql-jdbc.tx/add-test-extensions! :mysql)
```

You only need one call -- there's no need to do all three for a `:sql-jdbc` driver. This call should go at the beginning of your test extension namespace, like this:

```clj
(ns metabase.test.data.mysql
  (:require [metabase.test.data.sql-jdbc :as sql-jdbc.tx]))

(sql-jdbc.tx/register-test-extensions! :mysql)
```

## Anatomy of a Metabase test

Let's look at an real-life Metabase test so we can understand how it works and what exactly we need to do to power it:

```clj
;; expect-with-non-timeseries-dbs = run against all drivers listed in `DRIVERS` env var except timeseries ones like Druid
(expect-with-non-timeseries-dbs
  ;; expected results
  [[ 5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]
   [ 7 "Don Day Korean Restaurant"    44 34.0689 -118.305 2]
   [17 "Ruen Pair Thai Restaurant"    71 34.1021 -118.306 2]
   [45 "Tu Lan Restaurant"             4 37.7821 -122.41  1]
   [55 "Dal Rae Restaurant"           67 33.983  -118.096 4]]
  ;; actual results
  (-> (data/run-mbql-query venues
        {:filter   [:ends-with $name "Restaurant"]
         :order-by [[:asc $id]]})
      rows formatted-venues-rows))
```

Let's say we launch tests with

```
DRIVERS=mysql clojure -X:dev:drivers:drivers-dev:test`.
```

1.  Metabase will check and see if test extensions for `:mysql` are loaded. If not, it will `(require 'metabase.test.data.mysql)`.
2.  Metabase will check to see if the default `test-data` database has been created for MySQL, loaded with data, and synced. If not, it will call the test extension method `tx/load-data!` to create the `test-data` database and load data into it. After loading the data, Metabase syncs the test database. (This is discussed in more detail below.)
3.  Metabase runs an MBQL query against the `venues` table of the MySQL `test-data` database. The `run-mbql-query` macro is a helper for writing tests that looks up Field IDs based on names for symbols that have `$` in from of them. Don't worry too much about that right now; just know the actual query that is ran will look something like:
    ```clj
    {:database 100 ; ID of MySQL test-data database
     :type :query
     :query {:source-table 20 ; Table 20 = MySQL test-data.venues
             :filter [:ends-with [:field-id 555] "Restaurant"] ; Field 555 = MySQL test-data.venues.name
             :order-by [[:asc [:field-id 556]]]}} ; Field 556 = MySQL test-data.venues.id
    ```
4.  The results are ran through helper functions `rows` and `formatted-venues-rows` which return only the parts of the query results we care about
5.  Those results are compared against the expected results.

That's about as much as you'd need to know about the internals of how Metabase tests work; now that we've covered that, let's take a look at how we can empower Metabase to do what it needs to do.

## Loading Data

In order to ensure consistent behavior across different drivers, the Metabase test suite creates new databases and load datas into them from a set of shared _Database Definitions_. That means whether we're running a test against MySQL, Postgres, SQL Server, or MongoDB, a single test can check that we get the exact same results for every driver!

Most of these database definitions live in [EDN](https://github.com/edn-format/edn) files; the majority of tests run against a test database named "test data", whose definition can be found [here](https://github.com/metabase/metabase/blob/master/test/metabase/test/data/dataset_definitions/test-data.edn). Take a look at that file -- it's just a simple set of tables names, column names and types, and then a few thousand rows of data to load into those tables.

Like test extension method definitions, schemas for `DatabaseDefinition` live in [`metabase.test.data.interface`](https://github.com/metabase/metabase/blob/master/test/metabase/test/data/interface.clj) -- you can take a look and see exactly what a database definition is supposed to look like.

**Your biggest job as a writer of test definitions is to write the methods needed to take a database definition, create a new database with the appropriate tables and columns, and load data into it.** For non-SQL drivers, you'll need to implement `tx/load-data!`; `:sql` and `:sql-jdbc` have a shared implementation used by child drivers, but define their own set of test extension methods. For example, `:sql` (and `:sql-jdbc`) will handle the DDL statements for creating tables, but need to know what type it should use for the primary key, so you'll need to implement `sql.tx/pk-sql-type`:

```clj
(defmethod sql.tx/pk-sql-type :mysql [_] "INTEGER NOT NULL AUTO_INCREMENT")
```

I'd like to document every single test extension method in detail here, but until I find the time to do that, the methods are all documented in the codebase itself; take a look at the appropriate test extension namespaces and see which methods you'll need to implement. You can also refer to the test extensions written for other similar drivers to get a picture of what exactly it is you need to be doing.

## Connection Details

Of course, Metabase also needs to know how it can connect to your newly created database. Specifically, it needs to know what it should save as part of the connection `:details` map when it saves the newly created database as a `Database` object. All drivers with test extensions need to implement `tx/dbdef->connection-details` to return an appropriate set of `:details` for a given database definition. For example:

```clj
(defmethod tx/dbdef->connection-details :mysql [_ context {:keys [database-name]}]
  (merge
   {:host     (tx/db-test-env-var :mysql :host "localhost")
    :port     (tx/db-test-env-var :mysql :port 3306)
    :user     (tx/db-test-env-var :mysql :user "root")
    ;; :timezone :America/Los_Angeles
    :serverTimezone "UTC"}
   (when-let [password (tx/db-test-env-var :mysql :password)]
     {:password password})
   (when (= context :db)
     {:db database-name})))
```

Let's take a look at what's going on here.

### Connection context

`tx/dbdef->connection-details` is called in two different contexts:

- When creating a database,
- And when loading data into one and syncing.

Most databases won't let you connect to a database that hasn't been created yet, meaning something like a `CREATE DATABASE "test-data";` statement would have to be ran _without_ specifying `test-data` as part of the connection. Thus, the `context` parameter. `context` is either `:server`, meaning "give me details for connecting to the DBMS server, but not to a specific database", or `:db`, meaning "give me details for connecting to a specific database". In MySQL's case, it adds the `:db` connection property whenever context is `:db`.

### Getting connection properties from env vars

You'll almost certainly be running your database in a local Docker container. Rather than hardcode the connection details (the username, host, port...) for the Docker container, we'd like to be flexible, and let people specify those in environment variables, in case they're running against a different container or are just running the database outside of a container, or on another computer entirely. You can use `tx/db-test-env-var` to get details from environment variables. For example,

```clj
(tx/db-test-env-var :mysql :user "root")
```

Tells Metabase to look for the environment variable `MB_MYSQL_TEST_USER`; if not found, default to `"root"`. The name of the environment variable follows the pattern `MB_<driver>_TEST_<property>`, as passed into the function as first and second args, respectively. You don't need to specify a default value for `tx/db-test-env-var`; perhaps `user` is an optional parameter; and if `MB_MYSQL_TEST_USER` isn't specified, you don't need to specify it in the connection details.

But what about properties you want to require, but do not have sane defaults? In those cases, you can use `tx/db-test-env-var-or-throw`. It the corresponding enviornment variable isn't set, these will throw an Exception, ultimately causing tests to fail.

```clj
;; If MB_SQLSERVER_TEST_USER is unset, the test suite will quit with a message saying something like
;; "MB_SQLSERVER_TEST_USER is required to run tests against :sqlserver"
(tx/db-test-env-var-or-throw :sqlserver :user)
```

Note that `tx/dbdef->connection-details` won't get called in the first place for drivers you aren't running tests against (i.e., drivers not listed in the `DRIVERS` env var), so you wouldn't see that SQL Server error message when running tests against Mongo, for example.

Besides `tx/db-test-env-var`, `metabase.test.data.interface` has several other helpful utility functions. Take a good look at that namespace as well as `metabase.test.data.sql` if your database uses SQL and `metabase.test.data.sql-jdbc` if your database uses a JDBC driver.

## Other Test Extensions

There's a few other things Metabase needs to know when comparing test results. For example, different databases name tables and columns in different ways; methods exist to let Metabase know it should expect something like the `venues` table in the `test-data` Database Definition to come back as `VENUES` for a database that uppercases everything. (We consider such minor variations in naming to still mean the same thing.) Take a look at `tx/format-name` and other methods like that and see which ones you need to implement.

## What about DBMSes that don't let you create new databases programatically?

This is actually a common problem, and luckily we have figured out how to work around it. The solution is usually something like using different _schemas_ in place of different databases, or prefixing table names with the database name, and creating everything in the same database. For SQL-based databases, you can implement `sql.tx/qualified-name-components` to have tests use a different identifier instead of what they would normally use, for example `"shared_db"."test-data_venues".id` instead of `"test-data".venues.id`. The SQL Server and Oracle test extensions are good examples of such black magic in action.

# Setting up CI

Once you have all the tests passing, you'll need to set up GitHub Actions to run those tests against your driver. You'll need to add a new job to [`.github/workflows/drivers.yml`](https://github.com/metabase/metabase/blob/master/.github/workflows/drivers.yml) to run tests against your database.

Here is an example configuration for PostgreSQL.

```yaml
be-tests-postgres-latest-ee:
  needs: files-changed
  if: github.event.pull_request.draft == false && needs.files-changed.outputs.backend_all == 'true'
  runs-on: ubuntu-22.04
  timeout-minutes: 60
  env:
    CI: 'true'
    DRIVERS: postgres
    MB_DB_TYPE: postgres
    MB_DB_PORT: 5432
    MB_DB_HOST: localhost
    MB_DB_DBNAME: circle_test
    MB_DB_USER: circle_test
    MB_POSTGRESQL_TEST_USER: circle_test
    MB_POSTGRES_SSL_TEST_SSL: true
    MB_POSTGRES_SSL_TEST_SSL_MODE: verify-full
    MB_POSTGRES_SSL_TEST_SSL_ROOT_CERT_PATH: 'test-resources/certificates/us-east-2-bundle.pem'
  services:
    postgres:
      image: circleci/postgres:latest
      ports:
        - "5432:5432"
      env:
        POSTGRES_USER: circle_test
        POSTGRES_DB: circle_test
        POSTGRES_HOST_AUTH_METHOD: trust
  steps:
  - uses: actions/checkout@v4
  - name: Test Postgres driver (latest)
    uses: ./.github/actions/test-driver
    with:
      junit-name: 'be-tests-postgres-latest-ee'
```

For more on what it is you're doing here and how all this works, see [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions).
