---
title: Syncing and scanning databases
---

# Syncing and scanning databases

Metabase runs different types of queries to stay up to date with your database.

- [Syncs](#how-database-syncs-work) get updated schemas to display in the [Data Browser](https://www.metabase.com/learn/getting-started/data-browser).
- [Scans](#how-database-scans-work) take samples of column values to populate filter dropdown menus and suggest helpful visualizations. Metabase does not store _complete_ tables from your database.
- [Fingerprinting](#how-database-fingerprinting-works) takes an additional sample of column values to help with smart behavior, such as auto-binning for bar charts.

## Initial sync, scan, and fingerprinting

When Metabase first connects to your database, Metabase performs a [sync](#how-database-scans-work) to determine the metadata of the columns in your tables and automatically assign each column a [semantic type](../data-modeling/field-types.md). Once the sync is successful, Metabase runs [scans](#scheduling-database-scans) of each table to look for URLs, JSON, encoded strings, etc. The [fingerprinting](#how-database-fingerprinting-works) queries run once the syncs are complete.

You can follow the progress of these queries from **Admin** > **Troubleshooting** > **Logs**.

Once the queries are done running, you can view and edit the synced metadata from **Admin settings** > **Table Metadata**. For more info, see [editing metadata](../data-modeling/metadata-editing.md).

## Choose when Metabase syncs and scans

If you want to change the default schedule for [sync](#how-database-scans-work) and [scan](#scheduling-database-scans) queries:

1. Go to **Admin** > **Databases** > your database.
2. Expand **Show advanced options**.
3. Turn ON **Choose when syncs and scans happen**.

## Scheduling database syncs

If you've turned on [Choose when syncs and scans happen](#choose-when-metabase-syncs-and-scans), you'll be able to set:

- The frequency of the [sync](#how-database-syncs-work): hourly (default) or daily.
- The time to run the sync, in the timezone of the server where your Metabase app is running.

## Scheduling database scans

If you've turned ON [Choose when syncs and scans happen](#choose-when-metabase-syncs-and-scans), you'll see the following [scan](#how-database-scans-work) options:

- **Regularly, on a schedule** allows you to run [scan queries](#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database, or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when a new filter is added to a dashboard or SQL question.
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large, or which never really have new values added. Use the [Re-scan field values now](#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

## Manually syncing tables and columns

1. Go to **Admin settings** > **Databases** > your database.
2. Click **Sync database schema now**.

## Manually scanning column values

To scan values from all the columns in a table:

1. Go to **Admin settings** > **Table Metadata** > your database.
2. Select the table that you want to bring up to date with your database.
3. Click the **gear icon** at the top of the page.
4. Click **Re-scan this table**.

To scan values from a specific column:

1. Go to **Admin settings** > **Table Metadata** > your database.
2. Select the table.
3. Find the column you want bring up to date with your database.
4. Click the **gear icon** in the panel for that column.
5. Click **Re-scan this field**.

## Clearing cached values for a table or field

To clear the [scanned field values for a table](#syncing-and-scanning-databases):

1. Go to **Admin settings** > **Table Metadata**.
2. Select the database and table.
3. Click the **gear icon** in the upper right.
4. Click **Discard cached field values**.

You can also tell Metabase to forget the cached values for individual fields by clicking the **gear** icon on a field and clicking on **Discard cached field values**.

## Disabling syncing and scanning for specific tables

To prevent Metabase from running syncs and scans against a specific table, change the [table visibility](../data-modeling/metadata-editing.md#table-visibility) to **Hidden**:

1. Go to **Admin settings** > **Table Metadata** > your database.
2. Hover over the table name in the sidebar.
3. Click the **eye** icon.

> Hiding a table will also prevent it from showing up in the [query builder](../questions/query-builder/introduction.md) and [data reference](../exploration-and-organization/data-model-reference.md). People can still query hidden tables from the [SQL editor](../questions/native-editor/writing-sql.md).

## Syncing and scanning using the API

Metabase syncs and scans regularly, but if the database administrator has just changed the database schema, or if a lot of data is added automatically at specific times, you may want to write a script that uses the [Metabase API](https://www.metabase.com/learn/administration/metabase-api) to force a sync or scan. [Our API](../api-documentation.md) provides two ways to initiate a sync or scan of a database:

1. Using a session token: the `/api/database/:id/sync_schema` or `api/database/:id/rescan_values` endpoints. These endpoints do the same things as going to the database in the Admin Panel and choosing **Sync database schema now** or **Re-scan field values now** respectively. To use these endpoints, you have to authenticate with a user ID and pass a session token in the header of your request.
2. Using an API key: `/api/notify/db/:id`. We created this endpoint so that people could notify their Metabase to sync after an [ETL operation](https://www.metabase.com/learn/analytics/etl-landscape) finishes. To use this endpoint, you must pass an API key by defining the `MB_API_KEY` environment variable.

## How database syncs work

A Metabase **sync** is a query that gets a list of updated table and view names, column names, and column data types from your database:

```sql
SELECT
    TRUE
FROM
    "your_schema"."your_table_or_view"
WHERE
    1 <> 1
LIMIT 0
```

This query runs against your database during setup, and again every hour by default. This scanning query is fast with most relational databases, but can be slower with MongoDB and some [community-built database drivers](../developers-guide/partner-and-community-drivers.md). Syncing can't be turned off completely, otherwise Metabase wouldn't work.

## How database scans work

A Metabase **scan** is a query that caches the column _values_ for filter dropdowns by looking at the first 1,000 distinct records from each table, in ascending order:

```sql
SELECT
    "your_table_or_view"."column" AS "column"
FROM
    "your_schema"."your_table_or_view"
GROUP BY
    "your_table_or_view"."column"
ORDER BY
    "your_table_or_view"."column" ASC
LIMIT 1000
```

For each record, Metabase only stores the first 100 kilobytes of text, so if you have data with 1,000 characters each (like addresses), and your column has more than 100 unique addresses, Metabase will only cache the first 100 values from the scan query.

Cached column values are displayed in filter dropdown menus. If people type in the filter search box for values that aren't in the first 1,000 distinct records or 100kB of text, Metabase will run a query against your database to look for those values on the fly.

A scan is more intensive than a sync query, so it only runs once during setup, and again once a day by default. If you [disable scans](#scheduling-database-scans) entirely, you'll need to bring things up to date by running [manual scans](#manually-scanning-column-values).

To reduce the number of tables and fields Metabase needs to scan in order to stay current with your connected database, Metabase will only scan values for fields that someone has queried in the last fourteen days.

## Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

By default, Metabase only runs [fingerprinting](#how-database-fingerprinting-works) queries when you first connect your database.

Turn this setting ON if you want Metabase to use larger samples of column values when making suggestions in the UI:

1. Go to **Admin** > **Databases** > your database.
2. Expand **Show advanced options**.
3. Turn ON **Periodically refingerprint tables**.

## How database fingerprinting works

The fingerprinting query looks at the first 10,000 rows from a given table or view in your database:

```sql
SELECT
    *
FROM
    "your_schema"."your_table_or_view"
LIMIT 10000
```

The result of this query is used to provide better suggestions in the Metabase UI (such as filter dropdowns and auto-binning).
To avoid putting strain on your database, Metabase only runs fingerprinting queries the [first time](#initial-sync-scan-and-fingerprinting) you set up a database connection. To change this default, you can turn ON [Periodically refingerprint tables](#periodically-refingerprint-tables).

## Further reading

Metabase doesn't do any caching or rate limiting during the sync and scan process. If your data appears to be missing or out of date, check out:

- [Can’t see tables](../troubleshooting-guide/cant-see-tables.md).
- [Data in Metabase doesn’t match my database](../troubleshooting-guide/sync-fingerprint-scan.md).
