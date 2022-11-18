---
title: Troubleshooting syncs, scans, and fingerprinting
---

# Troubleshooting syncs, scans, and fingerprinting

First, check if your data is outdated because of browser caching:

1. Clear your browser cache.
2. Refresh your Metabase page.
3. Open your Metabase page in an incognito window.

Once you've confirmed that you're looking at a non-cached view of your tables and columns, tag your database admin for help with troubleshooting:

- **Syncs**, if your tables or columns are missing, or your column data types are wrong.
- **Scans**, if your column _values_ are wrong (for example, if your filter dropdown menus contain the wrong values).
- **Fingerprinting**, if you've triggered a manual scan, but the changes aren't taking effect.

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

A sync query should show up like this in your database's query execution table (using whatever role is defined in your database connection string):

```sql
SELECT TRUE
FROM "your_database"
WHERE 1 <> 1
LIMIT 0
```

If you’ve just set up a new database in Metabase, the initial sync query might still be running—--especially if you have a large database. To run the query, Metabase must:

- successfully connect to your database, and
- be granted permissions to query that database.

If the connection is failing, or the database privileges are wrong, the sync query won't be able to run. This will block the _initial_ scan and fingerprinting queries as well.

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

Metabase needs the correct database privileges to run the sync query against a given database, schema, and table (or view):

```sql
SELECT TRUE
FROM "your_database"."your_schema"."your_table_or_view"
WHERE 1 <> 1
LIMIT 0
```

## Syncing tables with JSON records

1. Go to **Admin** > **Databases** > **your database** > **Show advanced options**.
2. Click **Disable "JSON unfolding"**
3. Click **Save changes**.
4. Click **Sync database schema**.

**Explanation**

Metabase will try to unfold JSON and JSONB records during the sync process, which can take up a decent chunk of query execution time. If you have a lot of JSON records, try disabling the automatic unfolding option to pull the sync out of slow-motion. Remember that you can follow the status of the sync from **Admin** > **Troubleshooting** > **Logs**.

## Scanning

1. Go to **Admin** > **Data Model**.
2. Select the database and table.
3. Go to the column you want to update, and click the **gear** icon.
4. Click **Discard cached field values**.
5. Click **Re-scan this field**.
6. Go to **Admin** > **Troubleshooting** > **Logs** to follow the status of the scan.
7. If you get an error during the scan process, try running the scan query against your database directly, and debug the query execution error from there. Check for:
   - Schema and table privileges
   - Recent schema or table updates
   - Database-specific handling of nulls and numeric, timestamp, or boolean data types.

### Special cases

If you're waiting for the _initial_ scan to run after connecting a database, make sure the [initial sync](#initializing-a-sync) has completed first.

**Explanation**

Scan queries are run against your database to sample column values from the first 1,000 rows in a table or view:

```sql
SELECT "your_table"."column" AS "column"
FROM "your_database"."your_schema"."your_table_or_view"
GROUP BY "your_table"."column"
ORDER BY "your_table"."column" ASC
LIMIT 1000
```

A failed scan is caused by a failed scan query---you can debug the query just like any other query you'd try to run against your database.

## Fingerprinting

To manually re-trigger a fingerprinting query for a given column:

1. Go to **Admin** > **Databases** > **your database** > **Show advanced options**.
2. Toggle OFF **Periodically refingerprint tables**.
3. Go to **Admin** > **Data Model**.
4. Select your database and table.
5. Change the visibility of the table to **Hidden**.
6. Change the visibility back to **Queryable**.
7. Wait 10 seconds.
8. Go to your column and change the **Type** from **Entity Key** to **No semantic type**, and back to **Entity Key**.

### Special cases

If you're waiting for the _initial_ fingerprinting query to run after connecting a database, make sure the [initial sync](#initializing-a-sync) has completed first.

If you're using MongoDB, Metabase fingerprints the first 10,000 documents per collection. If you're not seeing all of your fields, it's because those fields might not exist in those first 10,000 documents. For more info, see our [MongoDB reference doc](../databases/connections/mongodb.md#i-added-fields-to-my-database-but-dont-see-them-in-metabase).

**Explanation**

The initial fingerprinting query looks at the first 10,000 rows from a given table or view in your database:

```sql
SELECT "your_table"."column" AS "column"
FROM "your_database"."your_schema"."your_table_or_view"
LIMIT 10000
```

If the first 10,000 rows aren't representative of the data in a table (for example, if you've got sparse data with a lot of blanks or nulls), you could see issues such as:

- Filter dropdown menus with missing values.
- Histogram visualizations that don't work (since Metabase needs a min and max value to generate the bins).

Metabase doesn't have a built-in option to trigger manual fingerprinting queries. You can "reset" a field's settings using the steps above to try and force a fingerprinting query, but it's not guaranteed to work on all versions of Metabase.

## Syncing or scanning is taking a long time

To speed up **syncs**:
   - Restrict the privileges used to connect to the database so that Metabase only syncs a limited subset of schemas or tables.
   - [Reduce the frequency of sync queries](../databases/connecting.md#scheduling-database-scans).

To speed up **scans**:
   - Prevent a column from being scanned by going to **Admin** > **Data Model** and setting the column's **Filtering on this field** setting to **Search box** or **Plain input box**.
   - [Reduce the frequency of scans, or disable scans entirely](../databases/connecting.md#scheduling-database-scans).

**Explanation**

Syncs and scans are ultimately just two kinds of queries that get run against your database, so the speed of execution is limited by the number of queries that are run, the frequency of execution, the size of your data, and the amount of resources you've allocated to your database. In Metabase, you can adjust the number and frequency of sync and scan queries, since unfortunately, we can't imbue your database with more power... (yet?)

## Using the API

1. Make sure you're able to run a [manual sync](../databases/connecting.md#manually-syncing-tables-and-columns) and [manual scan](../databases/connecting.md#manually-scanning-column-values).
2. Make sure you're using the correct URL to send the request to Metabase.
3. Check the error message returned from Metabase.
4. Check the credentials you're using to authenticate and make sure they identify your script as a user with administrative privileges.

## Related topics

- [Troubleshooting database connections](./db-connection.md).
- [Troubleshooting filters](./filters.md).
- [How syncs and scans work](../databases/connecting.md#syncing-and-scanning-databases).
- [Manally syncing tables and columns](../databases/connecting.md#manually-syncing-tables-and-columns).
- [Manally scanning column values](../databases/connecting.md#manually-scanning-column-values).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
