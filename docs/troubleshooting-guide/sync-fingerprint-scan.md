# Synchronizing with the database

<div class='doc-toc' markdown=1>
- [Metabase can't sync, fingerprint, or scan](#cant-sync-fingerprint-scan)
- [Metabase isn't showing all of the values I expect to see](#not-showing-all-values)
- [I cannot force Metabase to sync or scan using the API](#cant-force-with-api)
- [Sync and scan take a very long time to run](#sync-scan-long-time)
</div>

Metabase needs to know what's in your database in order to show tables and fields, populate dropdown menus, and suggest good visualizations, but loading all the data would be very slow (or simply impossible if you have a lot of data). It therefore does three things:

1. Metabase periodically asks the database what tables are available, then asks which columns are available for each table. We call this *syncing*, and it happens [hourly or daily][sync-frequency] depending on how you've configured it. It's very fast with most relational databases, but can be slower with MongoDB and some [community-built database drivers][community-db-drivers].

2. Metabase *fingerprints* the column the first time it synchronizes. Fingerprinting fetches the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. Metabase only fingerprints each column once, unless the administrator explicitly tells it to fingerprint the column again, or in the rare event that a new release of Metabase changes the fingerprinting logic.

3. A *scan* is similar to fingerprinting, but is done every 24 hours (unless it's configured to run less often or disabled).  Scanning looks at the first 5000 distinct records ordered ascending, when a field is set to "A list of all values" in the Data Model, which is used to display options in dropdowns. If the textual result of scanning a column is more than 10 kilobytes long, for example, we display a search box instead of a dropdown.

<h2 id="cant-sync-fingerprint-scan">Metabase can't sync, fingerprint, or scan</h2>

If the credentials Metabase is using to connect to the database don't give it privileges to read the tables, the first sign will often be a failure to sync, which would then also stop fingerprint and scan.

**How to detect this:** You can't see any of the tables in the database, or columns that have just been added to your data source don't show up in Metabase.

**How to fix this:** [This guide][troubleshooting-db-connection] explains how to troubleshoot database connections. The relevant steps for solving this problem are:

1. Sometimes browsers will show an old cached list of tables or columns. Refreshing the page will update the cache.
2. If you've just set up a new database in Metabase, the sync process might still be running---it's normally fast, but it can sometimes take a while. You can follow its progress in Admin > Troubleshooting > Logs.
3. If you've just added a table or a column, Metabase might not have synced yet. You can manually run the sync process by going to the Admin Panel, selecting "Databases", choosing your database, and clicking on "Sync database schema now".
4. To see if the problem is caused by lack of database privileges, try running a query like the one below for each table you think you should be able to access :

```
SELECT *
FROM table
LIMIT 1
```

Note that we only get the first 10,000 documents when scanning a MongoDB collection, so if you're not seeing some new fields, those fields might not exist in the documents we looked at. Please see [this discussion][metabase-mongo-missing] for more details.

<h2 id="not-showing-all-values">Metabase isn't showing all of the values I expect to see</h2>

**How to detect this:**

1. The UI isn't displaying some of the values you expect to see in a dropdown menu.
2. The UI is showing a search box for selecting values where you expect a dropdown menu.

**How to fix this:**

1. Go to the Admin Panel and select the **Data Model** tab.
2. Select the database, schema, table, and field in question.
3. Click the gear-icon to view all the field's settings.
4. Set **Field Type** to "Category" and **Filtering on this field** to "A list of all values."
5. Click the button **Re-scan this field** in the bottom.

<h2 id="cant-force-with-api">I cannot force Metabase to sync or scan using the API</h2>

Metabase syncs and scans regularly, but if the database administrator has just changed the database schema, or if a lot of data is added automatically at specific times, you may want to write a script that uses the [Metabase API][api-learn] to force sync or scan to take place right away. [Our API][metabase-api] provides two ways to do this:

1. Using an endpoint with a session token: `/api/database/:id/sync_schema` or `api/database/:id/rescan_values`. These do the same things as going to the database in the Admin Panel and choosing **Sync database schema now** or **Re-scan field values now** respectively. In this case you have to authenticate with a user ID and pass a session token in the header of your request.

2. Using an endpoint with an API key: `/api/notify/db/:id`. This endpoint was made to notify Metabase to sync after an [ETL operation][etl] finishes. In this case you must pass an API key by defining the `MB_API_KEY` environment variable.

**How to detect this:** Your script fails to run.

**How to fix this:**

1. Make sure you are able to sync and scan manually via the Admin Panel.
2. Make sure you're using the correct URL to send the request to Metabase.
3. Check the error message returned from Metabase.
4. Check the credentials you're using to authenticate and make sure they identify your script as a user with administrative privileges.

<h2 id="sync-scan-long-time">Sync and scan take a very long time to run</h2>

**How to detect this:** Sync and scan take a long time to complete.

**How to fix this:** 
1. For sync, delays are usually caused by a large database with hundreds of schema, thousands of table and with hundreds of columns in each table. If you only need a subset of those tables or columns in Metabase, then restricting the privileges used to connect to the database will make sure that Metabase can only sync a limited subset of the database.
2. Scanning normally takes longer than sync, but you can reduce the number of fields Metabase will scan by changing the number of fields that have the **Filtering on this field** option set to "A list of all values". Setting fields to either "Search box" or "Plain input box" will exclude those fields from scans.

You can "fix" this by disabling scan entirely by going to the database in the Admin Panel and telling Metabase, "This is a large database," and then going to the Scheduling tab. However, sync is necessary: without it, Metabase won't know what tables exist or what columns they contain.

[api-learn]: /learn/administration/metabase-api.html
[bugs]: ./bugs.html
[community-db-drivers]: ../developers-guide-drivers.html
[etl]: /glossary.html#etl
[metabase-api]: ../api-documentation.html
[metabase-mongo-missing]: ../administration-guide/databases/mongodb.html#i-added-fields-to-my-database-but-dont-see-them-in-metabase
[sync-frequency]: ../administration-guide/01-managing-databases.html#choose-when-metabase-syncs-and-scans
[troubleshooting-db-connection]: ./datawarehouse.html
