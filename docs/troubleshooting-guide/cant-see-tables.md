---
title: I can't see my tables
---

# I can't see my tables

You have connected Metabase to a database, but:

- you don't see the tables in the [Data Model](../data-modeling/metadata-editing.md) section of the Admin Panel,
- the tables don't appear in the [Data Browser](https://www.metabase.com/learn/getting-started/data-browser),
- the tables don't show up as possible data sources when you create a query using the Notebook Editor, or
- you can no longer see tables that you used to be able to see.

## Is your browser showing you a cached list of tables?

**Root cause:** Sometimes browsers will show an old cached list of tables.

**Steps to take:** Refresh your browser tab and check for your table or tables again.

## Does the database exist?

**Root cause:** The database doesn't exist. For example, you may have connected to a test database while doing an evaluation but are now in a production environment.

**Steps to take:**

1. Go to Admin > Databases.
2. Check that the database you're trying to query is listed.
3. Click on the database name and examine the settings.

Exactly what settings you need will depend on your environment. To test that the settings are correct:

1. Try to connect to the database using some other application (e.g., `psql` for PostgreSQL).

If you can't connect to the database with another application, the problem is probably not with Metabase. Please check that the database server is running and that you have the correct host, port, username, password, and other settings. For more help, see [Troubleshooting database connections](./db-connection.md).

## Does the table exist?

**Root cause:** The table you think you should be able to see does not exist (e.g., it has a different name than you expect).

**Steps to take:** To test that the table you are trying to query actually exists and that you have permission to access it, use the SQL Editor to create and run a query like:

```
select * from SOMEWHERE
```

where `SOMEWHERE` is the table you think you should be able to see. Metabase should display an error message like:

```
Table "SOMEWHERE" not found
```

If you see this message, use another application (e.g., `psql` for PostreSQL) to send the same query to the database. If it also produces a "table not found" message, check the database schema and the spelling of the table name.

Be sure to log in to the database using the same credentials that Metabase uses. A common problem is that the account Metabase uses to connect to the database lacks the same privileges as a member of IT staff or a developer, so tables that are visible to the latter when they use external applications are invisible to Metabase. For more help, see [Troubleshooting syncs, scans, and fingerprinting](./sync-fingerprint-scan.md).

## Does the person who cannot see the table have permission to view it?

**Root cause:** Metabase uses a group-based permission model: people belong to groups, and administrators can set permissions so that some groups cannot see all of the tables.

**Steps to take:**

1. Log into Metabase using the ID of the person who cannot see the expected tables.
2. Confirm that the tables are not visible.
3. Log out, then log in using the administrator's credentials.

If the administrator's account can see the tables but an individual person cannot, see [Troubleshooting data permissions](./data-permissions.md).

## MongoDB

MongoDB lets you "successfully connect" to any collection name, even the collection doesn't exist. If you don't see a MongoDB collection in Metabase, make sure that:

- you have the correct collection name, and
- the collection is non-empty.

## Related problems

- [My data sandboxes aren't working](./sandboxing.md).
- [I can't view or edit a question or dashboard](./cant-view-or-edit.md).
- [My visualizations are wrong](./visualization.md).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
