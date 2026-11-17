---
title: Transform tests
summary: Check that a query transform produces the output you expect by running it on test data instead of your real tables.
---

# Transform tests

{% include plans-blockquote.html feature="Transform tests" is_plural=true %}

_Data Studio > Data transformation > [transform name] > Tests_

A transform test runs your transform on test data you provide, then checks the output against what you expected. Your real data tables aren't touched: Metabase loads the test data into temporary tables, swaps them in for the tables your transform reads, and drops them when the test finishes.

Use transform tests to verify that your transforms work as expected, and to catch problems before a scheduled job writes wrong data to your warehouse.

## Prerequisites and permissions

Transform tests are supported on a subset of [databases that support transforms](./transforms-overview.md#databases-that-support-transforms): ClickHouse, MySQL/MariaDB, PostgreSQL, Redshift, and SQL Server. You can test [query-based transforms](query.md), but not currently [Python transforms](python.md).

Transform tests follow the permissions of the transform they belong to. To see a transform's tests, you need to be able to see the transform. To run a test, you need to be able to run the transform. See [Permissions for transforms](transforms-overview.md#permissions-for-transforms) for more.

## Components of a test

Each test has a name, an optional description, inputs, and checks.

**Inputs** are the test data that stands in for the tables the transform reads. You can specify the data values, or use the results of a SQL query that runs against the transform's source database. Every table the transform reads needs an input, or the test won't run.

**Checks** describe the output you expect. A check can require the output to contain exactly the rows you list (or the rows a query returns), or it can require a query against the output to return no rows.

## See a transform's tests

_Data Studio > Data transformation > [transform name] > Tests_

The **Tests** tab on a transform page lists the transform's tests, their checks, and the time and status of each test's last run. Click a test to open its page.

On the test's **Overview** tab, you'll see the status of the last run, a button to run the test, and a link to see all its runs. The **Inputs** and **Output** sections show the test's input data and checks.

## Run a test

_Data Studio > Data transformation > [transform name] > Tests > [test name]_

To run a test, open it and click **Run now** on the **Overview** tab. You can also run a test from the transform's **Tests** tab: click the **...** menu next to the test and select **Run test**.

A test run can end with one of these statuses:

- **Passed**: every check passed.
- **Failed**: at least one check didn't pass, including a check that couldn't run, for example because its SQL query has a mistake.
- **Error**: the test itself couldn't finish, for example because the database couldn't load the test data or run the transform's query.
- **Timeout**: the run took too long and Metabase stopped it.

The test's **Runs** tab lists every run of the test, newest first. Click a run to see when it started and ended, its status, and who ran it.

## Use an AI agent to write transforms and tests

To create a test, ask an AI agent to write it with the Metabase CLI. If you haven't already, install the [Metabase CLI](../../installation-and-operation/metabase-cli.md) and its [`/metabase-cli` skill](../../installation-and-operation/metabase-cli.md#the-metabase-cli-skill). The CLI comes with instructions that teach the agent how to plan and write transform tests.

Here's an example prompt that creates a transform and tests for the **Orders** table in a database similar to the **Sample** database included in Metabase:

> Write a new transform for the Orders table in the Warehouse database
> that keeps only orders with a positive discount. Add a test to
> check that only orders with a discount are returned, and that all
> of them are in the result. Also add tests for any edge cases that apply.
> Add it to a new folder called "Warehouse." Run the test and iterate
> if necessary until the tests pass.

Using this prompt, the agent creates a transform that writes a table with the same columns as **Orders**, and a test whose input includes **Discount** values of 0, 0.0001, -2, 5, and `null`. The test has a separate check for each condition: _no order without a positive discount_; _every order with a positive discount is in the output, unchanged_; _no order that is not in the input_; _each order at most once_; and _as many orders as the input has with a positive discount_. Agents don't produce the same result every time, so your test will probably look different.

To review the checks the agent wrote, open the transform's **Tests** tab and click the test's name.

## Version and transfer your tests with Remote Sync

If you use [Remote Sync](../semantic-layer/remote-sync.md), your transform tests live in your Git repository as files, next to the transforms they test. How you add tests depends on your Metabase's sync mode.

- In **read-write mode**, create tests with an agent and the Metabase CLI, as described above. Then push them to your repository like any other synced content.
- If your instance is in **read-only mode**, run your agent in a local checkout of the repository to write transforms and tests as files. If the agent tries to edit Metabase directly, tell it to use the [`@metabase/representations`](https://github.com/metabase/representations) package to write the files. Once the files are written, commit them, push, and open a pull request. After the pull request is merged, Metabase picks up the new tests the next time it pulls changes.

In either mode, you can have CI run your transform tests before changes reach production. For example, a GitHub Action can start a temporary Metabase in Docker, import the content from the pull request's commit, and use the Metabase CLI to run every test.

## Further reading

- [Transforms overview](transforms-overview.md)
- [Transform inspector](inspector.md)
- [Remote Sync](../semantic-layer/remote-sync.md)
