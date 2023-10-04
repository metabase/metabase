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
- **Scans**, if your column _values_ are missing or wrong (for example, in your filter dropdown menus).
- **Fingerprinting**, if you've triggered a manual scan, but the changes aren't taking effect.

## Syncing

1. Make sure your database driver is up to date.
2. Go to **Admin** > **Troubleshooting** > **Logs** to check the status of the sync.
3. Run a query against your database from the Metabase SQL editor to check for database connection or database privilege errors that aren't listed in the logs:

   ```sql
   SELECT
      *
   FROM
       "your_schema"."your_table_or_view"
   LIMIT 1
   ```
4. [Manually re-sync](../databases/sync-scan.md#manually-syncing-tables-and-columns) the table or view if needed.

### Special cases

If you’ve just set up a new database in Metabase, the initial sync query needs some time to kick off. If the sync hasn't started at all, try [Troubleshooting database connections](./db-connection.md).

**Explanation**

A sync query should show up like this in your database's query execution table (using the [privileges](../databases/users-roles-privileges.md) for the database user in the database connection details):

```sql
SELECT
    TRUE
FROM 
    "your_schema"."your_table_or_view"
WHERE 
    1 <> 1
LIMIT 0
```

To run the sync query, Metabase must:

- successfully connect to your database, and
- be [granted privileges](../databases/users-roles-privileges.md) to query that database. 

If the [connection is failing](./db-connection.md) or the database privileges are wrong, the sync query won't be able to run. If Metabase can't sync with your database after you first set it up, then the initial scan and fingerprinting queries won't run either.

## Unfolding JSON columns with Object records

1. Go to **Admin** > **Databases** > **your database** > **Show advanced options**.
2. Click **Disable "JSON unfolding"**
3. Click **Save changes**.
4. Click **Sync database schema**.

**Explanation**

Metabase will try to unfold JSON and JSONB records during the sync process, which can take up a decent chunk of query execution time. If you have a lot of JSON records, try disabling the automatic unfolding option to pull the sync out of slow-motion. Remember that you can follow the status of the sync from **Admin** > **Troubleshooting** > **Logs**.

## Scanning

1. Go to **Admin** > **Table Metadata**.
2. Select the database and table.
3. Go to the column you want to update, and click the **gear** icon.
4. Click **Discard cached field values**.
5. Click **Re-scan this field**.
6. Go to **Admin** > **Troubleshooting** > **Logs** to follow the status of the scan and debug errors from there.

### Special cases

If you're waiting for the initial scan to run after connecting a database, make sure the initial sync has completed first (remember you can check the status from **Admin** > **Troubleshooting** > **Logs**).

**Explanation**

Scan queries are run against your database to sample column values from the first 1,000 rows in a table or view:

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

A failed scan is caused by a failed scan query---you can look at the logs to debug the query similar to other queries you'd run directly against your database.

Note that when you [change a search box filter to a dropdown filter](../data-modeling/metadata-editing.md#changing-a-search-box-filter-to-a-dropdown-filter) from the Table Metadata, you'll trigger a scan query for that field. If you have a dropdown filter that isn't picking up all the values in a field, remember that Metabase only samples the first 1,000 unique values per field, and stores a maximum of 100 kilobytes of text. If you've got more than 1,000 unique values in a column, or a lot of text-heavy data (like long URLs or survey responses), you can:

- Use a search box filter for that field.
- Clean up the data further in your [ETL or ELT](https://www.metabase.com/learn/analytics/etl-landscape) process.

## Fingerprinting

To manually re-trigger a fingerprinting query for a given column:

1. Go to **Admin** > **Databases** > **your database** > **Show advanced options**.
2. Toggle ON **Periodically refingerprint tables** and click **Save changes**.
3. Go to **Admin** > **Table Metadata**.
4. Select your database and table.
5. Change the visibility of the table to "Hidden".
6. Change the visibility back to "Queryable".
7. Wait 10 seconds.
8. Go to your column and change the **Type** from "Entity Key" to "No semantic type", and back to "Entity Key".

### Special cases

If you're waiting for the initial fingerprinting query to run after connecting a database, make sure the initial sync has completed first (remember you can check the status from **Admin** > **Troubleshooting** > **Logs**).

If you're using MongoDB, Metabase fingerprints the first 10,000 documents per collection. If you're not seeing all of your fields, it's because those fields might not exist in those first 10,000 documents. For more info, see our [MongoDB reference doc](../databases/connections/mongodb.md#i-added-fields-to-my-database-but-dont-see-them-in-metabase).

**Explanation**

The initial fingerprinting query looks at the first 10,000 rows from a given table or view in your database:

```sql
SELECT 
    *
FROM 
    "your_schema"."your_table_or_view"
LIMIT 10000
```

If the first 10,000 rows aren't representative of the data in a table (for example, if you've got sparse data with a lot of blanks or nulls), you could see issues such as:

- Incorrect [filter types](../questions/query-builder/introduction.md#filter-types), such as a category when you want a calendar.
- Histogram visualizations that don't work (since Metabase needs a min and max value to generate the bins).

Metabase doesn't have a built-in option to trigger manual fingerprinting queries. You can "reset" a field's settings using the steps above to try and force a fingerprinting query, but it's not guaranteed to work on all versions of Metabase.

## Syncing or scanning is taking a long time

To speed up **syncs**:
   - Restrict the privileges used to connect to the database so that Metabase only syncs a limited subset of schemas or tables.
   - [Reduce the frequency of sync queries](../databases/sync-scan.md#scheduling-database-syncs).

To speed up **scans**:
   - [Reduce the frequency of scans, or disable scans entirely](../databases/sync-scan.md#scheduling-database-scans).
   - Reduce the number of columns being scanned by going to **Admin** > **Table Metadata** and setting **Filtering on this field** to **Search box** or **Plain input box**.

**Explanation**

Syncs and scans are ultimately just two kinds of queries that are run against your database, so the speed of execution is limited by the number of queries that are run, the frequency of execution, the size of your data, and the amount of resources you've allocated to your database. Metabase gives you options to adjust the number and frequency of sync and scan queries, since unfortunately, we can't imbue your database with more power... (yet?)

## Related topics

- [Troubleshooting database connections](./db-connection.md).
- [Troubleshooting filters](./filters.md).
- [How syncs and scans work](../databases/sync-scan.md#how-database-syncs-work).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
