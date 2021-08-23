# I can't see my tables

You have connected Metabase to a database, but:

- you don't see the tables in the [Data Model][data-model] section of the Admin Panel,
- the tables don't appear in the [Data Browser][data-browser],
- the tables don't show up as possible data sources when you create a query using the Notebook Editor, or
- you can no longer see tables that you used to be able to see.

If you can see the tables, but some of the rows or columns seem to be missing, please check out the [troubleshooting guide for sandboxing][sandboxing].

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

If you can't connect to the database with another application, the problem is probably not with Metabase. Please check that the database server is running and that you have the correct host, port, username, password, and other settings.

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

Be sure to log in using the same credentials that Metabase uses. A common source of problems is that the Metabase "user" does not have the same privileges as a member of IT staff or a developer, so tables that are visible to the latter using external applications are not visible to Metabase.

## Can the Metabase account access the table?

**Root cause:** The login ID that Metabase uses to query the database doesn't have privileges to view the table.

**Steps to take:** Use the SQL Editor to write and run a simple query like the one shown immediately above:

```
select * from SOMEWHERE
```

where `SOMEWHERE` is the table you think you should be able to see. If Metabase produces an error message saying the table can't be found, run the same query using another application. Again, make sure to log in using the same credentails that Metabase uses, not your regular account.

## Does the person who cannot see the table have permission to view it?

*Root cause:** Metabase uses a group-based permission model: people belong to groups, and administrators can set permissions so that some groups cannot see all of the tables. (It also allows administrators to control which rows or columns specific people can see---issues with that are covered in the troubleshooting guide for [sandboxing][sandboxing].)

**Steps to take:**

1. Log into Metabase using the ID of the person who cannot see the expected tables.
2. Confirm that the tables are not visible.
3. Log out, then log in using the administrator's credentials.

If the administrator's account can see the tables but an individual person cannot:

1. Go to Admin > Permissions and see if any groups have been denied access to the table.
2. If any groups have been denied access, go to Admin > People and look at the "Groups" column for the person who can't see the expected tables. If they're in a group that doesn't have access to the table, you may need to move them to another group or change table permissions.

## Is Metabase's metadata out of sync with the state of the database?

**Root cause:** In order to display available tables and columns in dropdown menus and previews, Metabase runs a query every hour to find out what tables are available and what columns are in each available table, and stores this information in its application database.

1. If a table has been added or removed since the last time this "sync" operation ran, Metabase's information about the database will be outdated.
2. In some rare cases Metabase may time out while synchronizing with the database. For example, if you're using MongoDB and have very large (hundreds of kilobytes) JSON blobs, the sync operation may not complete in the allowed time.

**Steps to take:**

1. Run the "sync" process manually:
   1. Go to Admin Panel > Databases.
   2. Choose the database.
   3. Click on "Sync database schema now".
2. Go to Admin > Troubleshooting > Logs and see if there are any error messages saying that the "sync" operation could not run (e.g., because the network or the database itself was temporarily down).
3. If there are no suspicious error messages, log out of Metabase, close the browser tab, log back into Metabase in a new browser tab, and try to access your table again.

[data-browser]: /learn/getting-started/data-browser.html
[data-model]: ../administration-guide/03-metadata-editing.html
[sandboxing]: ./sandboxing.html
