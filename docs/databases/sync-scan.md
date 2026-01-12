---
title: Syncing and scanning databases
summary: Learn how Metabase stays in sync with your database by running periodic queries to update metadata, sample field values, and compute stats.
---

# Syncing and scanning databases

Metabase periodically runs different types of queries on your data warehouse to stay up to date with your database's metadata. Knowing information about your data helps Metabase do things like display the right chart for the results automatically and populate dropdown menus in filter widgets.

- [Sync database schema](#how-database-syncs-work): grabs database schema, table structures, fields, constraints (primary and foreign keys), and deactivates deleted tables.
- [Scan field values](#how-database-scans-work): takes samples of column values to populate filter dropdown menus, find distinct values, and identify valid visualizations. Metabase doesn't store _complete_ tables from your database.
- [Fingerprinting](#how-database-fingerprinting-works): samples the first 10,000 rows of the table to compute statistics for each field in the sample depending on their type, notably: distinct values count, % of null values (all field types), average, median, min, max, and quartiles (numeric types).

## Initial sync, scan, and fingerprinting

When Metabase first connects to your database, it performs a [sync](#how-database-syncs-work) to determine the metadata of the columns in your tables and automatically assign each column a [semantic type](../data-modeling/semantic-types.md).

You can follow the progress of these queries from **Gear icon** >**Admin settings** > **Tools** > **Tasks** and filtering by the various sync tasks.

Once the queries are done running, you can view and edit the synced metadata from **Admin settings** > **Table Metadata**. For more info, see [editing metadata](../data-modeling/metadata-editing.md).

## Choose when syncs and scans happen

By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, you might want to choose when syncs and scans happen.

1. Click on the **Gear icon**.
2. Select **Admin settings**.
3. Go to **Databases**.
4. Select your database.
5. In the **Connection and sync** section, click on **Edit connection details**.
6. Expand **Show advanced options**.
7. Toggle **Choose when syncs and scans happen**.

From there, you can set schedules for syncs and scans.

### Database syncing

Options include:

- The frequency of the [sync](#how-database-syncs-work): hourly (default) or daily.
- The time to run the sync, in the timezone of the server where your Metabase app is running.

### Scanning for filter values

Scans will only include "active fields": fields that people have used within the past fourteen days. Metabase won't scan fields that haven't been used in over fourteen days. Fields that have become inactive will become active again when someone uses them, and Metabase will include them in the next scan.

Options include:

- **Regularly, on a schedule** allows you to run [scan queries](#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when someone adds a new filter widget to a dashboard or SQL question (i.e., they add a parameter to their SQL query).
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large or which never have new values added. Use the [Re-scan field values](#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

Regardless of which option you pick, if you [set a field to use a dropdown list in filter widgets](../data-modeling/metadata-editing.md#filtering), Metabase will need to get values for that dropdown. Whenever someone uses that filter widget, Metabase will first look for cached values (valid for fourteen days) to populate that dropdown; otherwise, it will re-scan that field for the most up-to-date values.

## Manually syncing tables and columns

1. Go to **Admin settings** > **Databases** > your database.
2. Click **Sync database schema**.

## Manually scanning column values

To scan values from all the columns in a table:

1. Go to **Admin settings** > **Table Metadata** > your database.
2. Select the table that you want to bring up to date with your database.
3. Click the **gear icon** at the top of the page.
4. Click **Re-scan this table**.

To scan values from a specific column:

1. Go to **Admin settings** > **Table Metadata** > your database.
2. Select the table.
3. Find the column you want to bring up to date with your database.
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

> Hiding a table will also prevent it from showing up in the [query builder](../questions/query-builder/editor.md) and [data reference](../exploration-and-organization/data-model-reference.md). People can still query hidden tables from the [SQL editor](../questions/native-editor/writing-sql.md).

## Syncing and scanning using the API

Metabase syncs and scans regularly, but if the database administrator has just changed the database schema, or if a lot of data is added automatically at specific times, you may want to write a script that uses the [Metabase API](../api.html) to force a sync or scan. The API provides two ways to initiate a sync or scan of a database:

### Sync or scan the database

You can use these endpoints by authenticating with a user ID and passing a session token in the header of your request.

- **Sync database schema**: `/api/database/{id}/sync_schema`
- **Re-scan field values**: `/api/database/{id}/rescan_values`

### Sync a single table

- `/api/notify/db/{id}` to tell Metabase to sync a database, or optionally a specific table.
- `/api/notify/db/{id}/new-table` to sync a new table, without syncing the whole database. Requires `schema_name` and `table_name`.

To use this endpoint, you must pass a string via the `MB_API_KEY` environment variable. This string is distinct from Metabase's [API keys](../people-and-groups/api-keys.md).

We created the `notify` endpoint so that people could tell their Metabase to sync after an [ETL operation](https://www.metabase.com/learn/grow-your-data-skills/data-landscape/etl-landscape) finishes.

See our [API docs](../api.html).

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

By default, this query runs against your database during setup and again every hour. This scanning query is fast with most relational databases but can be slower with MongoDB and some [community-built database drivers](../developers-guide/community-drivers.md). Syncing can't be turned off completely, otherwise Metabase wouldn't work.

Here's the kind of data that gets synced and why:

| What             | Why                                          |
| ---------------- | -------------------------------------------- |
| Table names      | Without tables, what are we even doing here? |
| Field names      | Without fields, same deal                    |
| Field data types | Querying and type handling                   |
| Primary keys     | Table display, detailed views, auto-joins    |
| Foreign keys     | Auto-joins and relationship visualization    |

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

For each record, Metabase only stores the first 100 kilobytes of text, so if you have data with 1,000 characters each (like addresses) and your column has more than 100 unique addresses, Metabase will only cache the first 100 values from the scan query.

Cached column values are displayed in filter dropdown menus. If people type in the filter search box for values that aren't in the first 1,000 distinct records or 100 kB of text, Metabase will run a query against your database to look for those values on the fly.

A scan is more intensive than a sync query, so it only runs once during setup and again once a day by default. If you [disable scans](#scanning-for-filter-values) entirely, you'll need to bring things up to date by running [manual scans](#manually-scanning-column-values).

To reduce the number of tables and fields Metabase needs to scan to stay current with your connected database, Metabase will only scan values for fields that someone has used in the last fourteen days.

Here's the kind of data that scans get and why:

| What                                           | Why                                                          |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Distinct values for category fields            | Dropdown filter UI instead of text entry                     |
| Cached values for active fields                | Improves filter UI experience                                |
| Advanced field values (with filtering context) | Values when the data is restricted by row or column security |

## Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

By default, Metabase only runs [fingerprinting](#how-database-fingerprinting-works) queries when you first connect your database.

Turn this setting on if you want Metabase to use larger samples of column values when making suggestions in the UI:

1. Go to **Admin** > **Databases** > your database.
2. Click on **Edit connection details**.
3. Expand **Show advanced options**.
4. Turn on **Periodically refingerprint tables**.

## How database fingerprinting works

The fingerprinting query looks at the first 10,000 rows from a given table or view in your database:

```sql
SELECT
    *
FROM
    "your_schema"."your_table_or_view"
LIMIT 10000
```

Metabase uses the results of this query to provide better suggestions in the Metabase UI (such as auto-binning).

To avoid putting strain on your database, Metabase only runs fingerprinting queries the [first time](#initial-sync-scan-and-fingerprinting) you set up a database connection.

By default, Metabase won't re-fingerprint your database after that initial fingerprinting. To re-fingerprint your data, you can turn ON [Periodically refingerprint tables](#periodically-refingerprint-tables).

Here's the kind of data that fingerprinting gets and why:

| What                                                                 | Why                                         |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Distinct value count                                                 | Determines field value caching strategy     |
| Min/max numeric values                                               | Binning in visualizations and range filters |
| Date range (min/max dates)                                           | Date filter defaults and timeline display   |
| Special type detection (URL, email, JSON, Geo data (like US States)) | Field rendering and filtering               |
| Null value ratio                                                     | Data quality assessment                     |
| Average/median values                                                | Visualization defaults                      |
| Text length metrics                                                  | Hide long text fields from UI               |

## Further reading

Metabase doesn't do any caching or rate limiting during the sync and scan process. If your data appears to be missing or out of date, check out:

- [Can't see tables](../troubleshooting-guide/cant-see-tables.md).
- [Data in Metabase doesn't match my database](../troubleshooting-guide/sync-fingerprint-scan.md).
