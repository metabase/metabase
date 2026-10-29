---
title: Transform tests
summary: Check that a query transform produces the output you expect by running it on test data instead of your real tables.
---

# Transform tests

{% include plans-blockquote.html feature="Transform tests" is_plural=true %}

_Data Studio > Data transformation > [transform name] > Tests_

A transform test runs your transform on test data you provide, then checks the output against what you expected. Your real data tables aren't touched: Metabase loads the test data into temporary tables, swaps them in for the tables your transform reads, and drops them when the test finishes.

Use transform tests to verify that your transforms work as expected, and to catch problems before a scheduled job writes wrong data to your warehouse.

## See a transform's tests

_Data Studio > Data transformation > [transform name] > Tests_

The **Tests** tab lists the transform's tests, their checks, and the time and status of each test's last run. Click a test to open its page.

On the test's **Overview** tab, you'll see:

- **Run this test**: the last run's status, plus buttons to run the test and see all its runs.
- **Inputs**: the test data that stands in for each source table.
- **Output**: the checks on the transform's target table.

## Run a test

To run a test, either:

- Open the test and click **Run now** on the **Overview** tab.
- On the transform's **Tests** tab, click the **...** menu next to the test and select **Run test**.

A test run can end with one of these statuses:

- **Passed**: every check passed.
- **Failed**: at least one check didn't pass.
- **Error**: Metabase couldn't evaluate a check, for example because its SQL query has a mistake.
- **Timeout**: the run took too long and Metabase stopped it.

## Review past test runs

_Data Studio > Data transformation > [transform name] > Tests > [test name] > Runs_

The test's **Runs** tab lists every run of the test, newest first. You can filter runs by **Started at**, **Ended at**, and **Status**. Click a run to see when it started and ended, its status, and who ran it.

## Transform tests work on query transforms

You can test [query-based transforms](query.md), but not currently [Python transforms](python.md).

The transform's database also needs to support tests. Currently, you can run transform tests on ClickHouse, MySQL/MariaDB, PostgreSQL, Redshift, and SQL Server.

## Create tests using the CLI or remote sync

To add a test, either:

- Write the test into the YAML files in your [Remote Sync](../../installation-and-operation/remote-sync.md#8-configure-transforms-syncing-optional) repository, then pull the changes into Metabase.
- Create the test with the [API](../../api.html) (`POST /api/ee/transform-test`).

The specification has to adhere to [the TransformTest YAML specification](https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md#transformtest). Our [`@metabase/representations` npm package](https://github.com/metabase/representations) can validate the schema and lint the test.

## Components of a test

Each test has:

- A **name** and an optional description.
- **Inputs**: test data for the tables the transform reads.
- **Checks**: what the transform's output table should look like.

### Test inputs

Each input replaces one of the transform's source tables. You can give an input as:

- **Rows**: a list of columns, each with the type its values should be cast to, and the rows themselves.
- **Rows returned by a query**: a SQL query that Metabase runs against the transform's source database. The query's results become the test data.

If your transform reads a table the test doesn't provide an input for, Metabase won't run the test. That way, a test can't quietly read your production data and pass. Metabase also refuses an input for a table the transform doesn't read.

### Output checks

A test can have one or more checks, each with a unique name. There are two kinds of checks:

- **Must hold exactly these rows**: the output table has to contain exactly the rows you list (or the rows a SQL query returns), over exactly the columns you list.
- **This query must return no rows**: you write a SQL query against the output table, and the check passes if it returns nothing. For example, a query that selects rows where `order_total` is negative.

## Permissions for transform tests

Transform tests follow the permissions of the transform they belong to:

- To **see** a transform's tests, you need to be able to see the transform.
- To **run** a test, you need to be able to run the transform. See [Permissions for transforms](transforms-overview.md#permissions-for-transforms).

## Further reading

- [Transforms overview](transforms-overview.md)
- [Query transforms](query.md)
- [Transform inspector](inspector.md)
- [Remote Sync](../../installation-and-operation/remote-sync.md)
