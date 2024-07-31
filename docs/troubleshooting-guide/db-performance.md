---
title: Troubleshooting database performance
---

# Troubleshooting database performance

This guide deals with databases or data warehouses that are [connected to Metabase](../databases/connecting.md) as data sources.

To fix problems with your Metabase [application database](../installation-and-operation/configuring-application-database.md), check out these troubleshooting guides:

- [Running Metabase](./running.md).
- [Running Metabase on Docker](./docker.md).
- [Using or migrating from an H2 application database](./loading-from-h2.md).

## Identifying bottlenecks

1. Optional: use Metabase's [Usage analytics](../usage-and-performance-tools/usage-analytics.md) to look at your Metabase usage stats.\*
2. Go to your database's server logs and check whether:
   - Your tables are growing in size,
   - More people are using Metabase to access your database,
   - People are accessing your database more often, or
   - A script or application (other than Metabase) is accessing the database frequently.
3. If specific tables are being queried a lot, try [Optimizing your table schemas](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#organize-data-to-anticipate-common-questions).
4. Run a question from Metabase, then [run the same query](../questions/query-builder/introduction.md#viewing-the-sql-that-powers-your-question) directly against your database.
   - If the queries take about the same time, your data or usage might be outgrowing your database. You can give your database more resources, or consider [upgrading your hardware](https://www.metabase.com/learn/analytics/which-data-warehouse).
   - If the query in Metabase takes longer than a direct query against your database, you might need to adjust the deployment of your Metabase app. Check out some options in [Metabase at scale](https://www.metabase.com/learn/administration/metabase-at-scale).
5. If a script or third-party application is hitting your database with a lot of queries at a time:
   - Stop your script or application, and [clear any queued queries](#clearing-queued-queries).
   - Recommended: add a timeout to your script, schedule the script or application to run during off-hours, or replicate your database (and point your tools there instead).

\* Available on Pro and Enterprise plans.

## Resetting a database connection

1. Go to **Settings** > **Admin settings** > **Databases** > your database.
2. Click **Save changes** (without making changes) to reset Metabase's connections to your database.
3. Alternatively: kill the connection(s) directly from your database.

**Explanation**

"Turn it off, and on again" by disconnecting and reconnecting your database---an easy sanity check that can save you a lot of time.

In general, Metabase will try to close hanging connections to your database after 10 minutes, and then again after 20 minutes. But if your database doesn't respond, you may need to close the connection to Metabase from the database side.

## Clearing queued queries

1. Stop the process (e.g., a script, or a dashboard with [too many cards](./my-dashboard-is-slow.md#dashboard-has-over-10-cards) that's launching a lot of queries at once.
2. Go to your database server and stop all queries (from Metabase) that are in progress.
3. Optional: Increase the [number of connections to your database](../configuring-metabase/environment-variables.md#mb_jdbc_data_warehouse_max_connection_pool_size).

**Explanation**

If someone or something creates 100 queries at the same time, this stampede of queries will take up all of the available connections between Metabase and your database, preventing any new queries from running. If other people continue running questions and dashboards while the first 100 queries are still in progress, the queue will grow at a faster rate than your database can keep up with.

## Managing resource-intensive queries

1. [Reschedule or disable Metabase syncs and scans](../databases/sync-scan.md).

**Explanation**

By default, Metabase makes regular sync and scan queries against your database to keep your tables up to date, get fresh values for filter dropdowns, and make helpful suggestions. If you've got a very large database, you can choose to trigger these queries manually instead of on a schedule.

## Questions that use number, date, or timestamp columns

1. Update your database schema so that the columns are typed correctly.
2. [Sync the updated columns](../databases/sync-scan.md#manually-syncing-tables-and-columns) to bring the changes into Metabase.

**Explanation**

If a question uses data stored as the wrong [data type](https://www.metabase.com/learn/databases/data-types-overview) in your database (most common with number, date, or timestamp values stored as strings), Metabase will generate a query that asks your database to convert the values on the fly. Typing your columns correctly at the schema level will help your database avoid that extra step to return results faster in Metabase.

## Related problems

- [My connection or query is timing out](./timeout.md).
- [I can't connect to a database](./db-connection.md).
- [My dashboard is slow or failing to load](./my-dashboard-is-slow.md).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
