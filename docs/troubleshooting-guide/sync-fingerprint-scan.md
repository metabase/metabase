# Synchronizing with the database

Metabase needs to know what's in your database in order to populate dropdown menus and suggest good visualizations, but loading all the data would be very slow (or simply impossible if you have a lot of data). It therefore does three things:

1. Metabase periodically asks the database what tables are available, then asks which columns are available for each table. We call this *syncing*, and happens every hour unless you configure it to run more or less frequently. It's very fast with most relational databases, but can be slower with MongoDB, Athena, and Presto back-ends.

2. Metabase *fingerprints* the database the first time it connects. Fingerprinting fetches the first 10,000 rows from each table and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. Metabase only fingerprints each database once unless the administrator explicitly tells it to run again.

3. *Scan* is basically the same as fingerprinting, but is done every 24 hours (unless it's configured to run more or less often).  Scanning looks at 5000 records instead of 10,000, and keeps track of things like how many distinct values are present. If the textual result of scanning a column is more than 10 kbyte long, for example, we display a search box instead of a dropdown.

## Specific Problems

### Metabase can't sync, fingerprint, or scan

If Metabase can't connect to the database, or the credentials that Metabase is using don't give it permission to read the tables, the first sign will often be a failure to sync, fingerprint, or scan.

**How to detect this:** You are unable to see any of the tables in the database, or a question that used to run is no longer able to run at all. If the root cause is that Metabase can't connect to the database, there will be lots of messages in the log.

**How to fix this:** [This guide][troubleshooting-db-connection] explains how to troubleshoot database connections. The relevant steps for solving this problem are:

1. Is the data warehouse server running?
2. Can you connect to the data warehouse using another client from a machine you know should have access?
3. Can you connect to the data warehouse from another client from the machine you're running Metabase on?
4. Can you run a query like the one shown below (which returns an empty set of results) for each table you're supposed to be able to access?

```
SELECT TRUE
FROM table
WHERE 1 <> 1
LIMIT 0
```

### Metabase isn't showing all of the values I expect to see

**How to detect this:**

1. Some of the tables you expect to be able to query aren't being displayed.
2. Some of the results you expect from a question aren't showing up.
3. The UI isn't displaying some of the values you expect to see in a dropdown menu.
4. The UI is showing a search box for selecting values where you expect a dropdown menu or vice versa.

**How to fix this:**

1. Go to the Admin Panel and select "Databases"
2. Select the database in question.
3. Choose "Sync database schema now" and "Re-scan field values now".
4. Check the log for error messages.
5. Re-run the question or re-try the operation that alerted you to the problem.

Please note that we only scan the first 10,000 records (or documents in MongoDB), so if your data is ordered or otherwise structured so that some values don't occur in the set we sample, they will not show up. Please see [this discussion][metabase-mongo-missing] for more details on MongoDB in particular.

### The DESCRIPTION fields for my columns are empty

Many relational databases allow administrators to add descriptions to columns when creating tables. These descriptions are separate from Metabase's internal metadata, but when Metabase syncs with the database, it loads these descriptions so that they can be displayed along with our metadata.

**How to detect this:** Descriptions that are in the database aren't showing up.

**How to fix this:**

1. The usual cause is that the descriptions don't exist: most database administrators don't add descriptions to columns.
2. Additionally, Oracle manages descriptions differently from other relational databases, and non-relational databases such as MongoDB don't have column descriptions at all.
3. If you are sure that the descriptions are there and you are using a relational database other than Oracle, you may have found a bug: please [let us know][bugs].

### I cannot force Metabase to sync or scan using the API

Metabase syncs and scans regularly, but if the database administrator has just changed the database schema, or if a lot of data is added automatically at specific times, you may want to write a script that uses the [Metabase API][metabase-api] to force sync or scan to take place right away. There are two ways to do this:

1. Using an endpoint with a session token: `/api/database/:id/sync_schema` or `api/database/:id/rescan_values`. These do the same things as going to the database in the Admin Panel and choosing "Sync database schema now" or "Re-scan field values now" respectively. In this case you have to authenticate with a user ID and pass a session token in the header of your request.

2. Using an endpoint with an API key: `/api/notify/db/:id`. This endpoint was made to notify Metabase to sync after an [ETL operation][etl] finishes. In this case you must pass an API key by defining the `MB_API_KEY` environment variable.

**How to detect this:** Your script fails to run.

**How to fix this:**

1. Make sure you are able to sync and scan manually via the Admin Panel.
2. Check the URL you are using to send the request to Metabase.
3. Check the error message returned from Metabase.
4. Check the credentials you are using to authenticate and make sure they identify your script as a user with administrative privileges.

### Sync and scan take a very long time to run

**How to detect this:** Sync and scan take longer than a few seconds to complete, and/or the UI freezes while you are waiting for them to finish.

**How to fix this:** The root cause is usually an unusual database schema. For example, if you have a table with several thousand columns (not rows---columns), it will take Metabase a while to scan them all. While this may seem unlikely, it can sometimes happen when a table has been pivoted so that (for example) customer IDs have been turned into columns.

You can "fix" this by disabling scan entirely by going to the database in the Admin Panel and telling Metabase, "This is a large database," and then going to the Scheduling tab. However, sync is necessary: without it, Metabase won't know what tables exist or what columns they contain. To actually solve the problem, you will have to re-think the organization of your database.

[bugs]: ./bugs.html
[etl]: /glossary.html#etl
[metabase-api]: ../docs/latest/api-documentation.html
[metabase-mongo-missing]: /docs/latest/administration-guide/databases/mongodb.html#i-added-fields-to-my-database-but-dont-see-them-in-metabase
[troubleshooting-db-connection]: ./datawarehouse.html#troubleshooting-your-database-connection
