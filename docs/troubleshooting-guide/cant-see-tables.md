---
title: I can't see my tables
---

# I can't see my tables

You have connected Metabase to a database, but:

- you don't see the tables in the [Data Model](../data-modeling/metadata-editing.md) section of the Admin Panel,
- the tables don't appear in the [Data Browser](https://www.metabase.com/learn/getting-started/data-browser),
- the tables don't show up as possible data sources when you create a query using the Notebook Editor, or
- you can no longer see tables that you used to be able to see.

## Check browser

1. Clear your browser cache.
2. Check if a browser extension or plugin is interfering with Metabase:
   - Disable all extensions and plugins,
   - Open Metabase in an incognito browser session, or
   - Open Metabase in a different browser.

**Explanation** 

Sometimes your browser will show an old cached list of tables. Browser extensions can also prevent pages from loading correctly.

## Test database connection

1. Go to the Metabase [SQL editor](../questions/native-editor/writing-sql.md).
2. Test the connection to your database by running:
    ```
    SELECT 1
    ```

If you get an error, see [Troubleshooting database connections](./db-connection.md).

**Explanation**

Something may have changed on the database side (if you were previously connected). For example, you may have connected to a test database while doing an evaluation but are now in a production environment.

## Check table access

To test that the table you are trying to query actually exists and that you have permission to access it:

1. Go to the Metabase [SQL editor](../questions/native-editor/writing-sql.md).
2. Look for your table:
    ```
    SELECT * 
    FROM SOMEWHERE
    ```

where `SOMEWHERE` is the table you think you should be able to see. If there's a problem with your table name or access, you'll get an error message like:

- [Table not found](https://www.metabase.com/learn/debugging-sql/sql-syntax#column-or-table-name-is-not-found-or-not-recognized)
- [Permission denied](./data-permissions.md#getting-a-permission-denied-error-message)

## Metabase permissions

If there's only a few people who can't view tables out of all your Metabase accounts, see [A user group has the wrong access to a table or schema](./data-permissions.md#a-user-group-has-the-wrong-access-to-a-table-or-schema).

**Explanation** 

Metabase uses a group-based permission model: people belong to groups, and administrators can set permissions so that some groups cannot see all of the tables.

## MongoDB

MongoDB lets you "successfully connect" to any collection name, even if the collection doesn't exist. If you don't see a MongoDB collection in Metabase, make sure that:

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
