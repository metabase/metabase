---
title: Troubleshooting syncs, scans, and fingerprinting
---

# Troubleshooting syncs, scans, and fingerprinting

First, check if your data is outdated because of browser caching:

1. Clear your browser cache.
2. Refresh your Metabase page.
3. Open your Metabase page in an incognito window.

If you're looking at a non-cached view of your tables and columns and the data still isn't quite right, tag your database admin for help with troubleshooting:

1. **Syncs**, if your tables are missing, or your column data types are wrong.
2. **Scans**, if you're missing _columns_ from your tables.
3. **Fingerprinting**, if your column _values_ are wrong (for example, if your filter dropdown menus contain the wrong values).

## Initializing a sync

1. Go to **Admin** > **Troubleshooting** > **Logs** to check the status of the sync.
2. Make sure your database driver is up to date.
3. Run a query against your database from the Metabase SQL editor to check for database connection or database privilege errors:
    ```
    SELECT *
    FROM "your_database"
    LIMIT 1
    ```
4. For more help, see [Troubleshooting database connections](./db-connection.md).

**Explanation**

A sync query should show up like this in your database's query execution table (using whatever role is defined in your [connection string]()):

```sql
SELECT TRUE
FROM "your_database"
WHERE 1 <> 1
LIMIT 0
```

If you’ve just set up a new database in Metabase, the initial sync query might still be running—especially if you have a large database. To run the query, Metabase must:

- successfully connect to your database, and
- be granted permissions to query that database.

If the connection is failing, or the database privileges are wrong, the sync query won't be able to run. This will block the initial scan and fingerprinting queries as well.

## Syncing new or updated tables and views

1. Go to **Admin** > **Troubleshooting** > **Logs** to check the status of the sync.
2. If the logs show you that the sync is failing on a specific table or view, make sure Metabase has the correct database privileges to query that table or view.
3. Run a query against your database from the Metabase SQL editor to check for database connection or database privilege errors that aren't listed in the logs:
    ```sql
    SELECT *
    FROM "your_database"."your_schema"."your_table_or_view"
    LIMIT 1
    ```
4. [Manually re-sync](../databases/connecting.md#manually-syncing-tables-and-columns) the table or view.

**Explanation**

Metabase needs the correct database privileges to query a given database, schema, and table (or view) during the sync process.

## Syncing tables with JSON records

1. Go to **Admin** > **Databases** > **your database** > **Show advanced options**.
2. Click **Disable "JSON unfolding"**
3. Click **Save changes**.
4. Click **Sync database schema**.

**Explanation**

Metabase will try to unfold JSON and JSONB records during the sync process, which is a pretty slow operation. If you have a lot of JSON records, try disabling the automatic unfolding to see if that unblocks your sync. Remember that you can follow the status of the sync from **Admin** > **Troubleshooting** > **Logs**.

## Scanning

1. Manually start a scan.
2. Go to **Admin** > **Troubleshooting** > **Logs** to check the status of the scan.
3. 

### Special cases

If you're waiting for the _initial_ scan to run after connecting a database, make sure the [initial sync](#initial-sync) has completed first.

**Explanation**

Scan queries are run against your database like this:

```sql
SELECT "your_table"."column" AS "column"
FROM "your_table"
GROUP BY "your_table"."column"
ORDER BY "your_table"."column" ASC
LIMIT 1000
```

## Syncing or scanning is taking a long time

1. For sync, delays are usually caused by a large database with hundreds of schema, thousands of table and with hundreds of columns in each table. If you only need a subset of those tables or columns in Metabase, then restricting the privileges used to connect to the database will make sure that Metabase can only sync a limited subset of the database.
2. Scanning normally takes longer than sync, but you can reduce the number of fields Metabase will scan by changing the number of fields that have the **Filtering on this field** option set to "A list of all values". Setting fields to either "Search box" or "Plain input box" will exclude those fields from scans.

You can "fix" this by disabling scan entirely by going to the database in the Admin Panel and telling Metabase, "This is a large database," and then going to the Scheduling tab. However, sync is necessary: without it, Metabase won't know what tables exist or what columns they contain.

**Explanation**



## Fingerprinting

To manually re-trigger a fingerprinting query for a given table:

1. Go to **Admin** > **Data Model**.
2. Select your database and table.
3. Change the visibility of the table to **Hidden**.
4. Change the visibility back to **Queryable**.

### Special cases

If you're using MongoDB, Metabase fingerprints the first 10,000 documents per collection. If you're not seeing all of your fields, it's because those fields might not exist in those first 10,000 documents. For more info, see our [MongoDB reference doc](../databases/connections/mongodb.md#i-added-fields-to-my-database-but-dont-see-them-in-metabase).

**Explanation**

The initial fingerprinting query looks at the first 10,000 rows from a given table or view in your database:

```sql
SELECT "your_table"."column" AS "column"
FROM "your_table"
LIMIT 10000
```

If the first 10,000 rows aren't representative of the data in a table (for example, if you've got sparse data with a lot of blanks or nulls), you could see issues such as:

- Filter dropdown menus with missing values.
- Histogram visualizations that don't work (since Metabase needs a min and max value to generate the bins).

## Using the API

1. Make sure you are able to sync and scan manually via the Admin Panel.
2. Make sure you're using the correct URL to send the request to Metabase.
3. Check the error message returned from Metabase.
4. Check the credentials you're using to authenticate and make sure they identify your script as a user with administrative privileges.

**Explanation**

Metabase syncs and scans regularly, but if the database administrator has just changed the database schema, or if a lot of data is added automatically at specific times, you may want to write a script that uses the [Metabase API][api-learn] to force sync or scan to take place right away. [Our API][metabase-api] provides two ways to do this:

1. Using an endpoint with a session token: `/api/database/:id/sync_schema` or `api/database/:id/rescan_values`. These do the same things as going to the database in the Admin Panel and choosing **Sync database schema now** or **Re-scan field values now** respectively. In this case you have to authenticate with a user ID and pass a session token in the header of your request.

2. Using an endpoint with an API key: `/api/notify/db/:id`. This endpoint was made to notify Metabase to sync after an [ETL operation][etl] finishes. In this case you must pass an API key by defining the `MB_API_KEY` environment variable.

## Related topics

- [Can't see tables](./cant-see-tables.md).
- [Troubleshooting database connections](./db-connection.md).
- [Troubleshooting filters](./filters.md).
- [How syncs and scans work](../databases/connecting.md#syncing-and-scanning-databases).
- [Manally syncing tables and columns](../databases/connecting.md#manually-syncing-tables-and-columns).
- [Manally scanning column values](../databases/connecting.md#manually-scanning-column-values).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).