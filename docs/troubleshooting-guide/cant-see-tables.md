---
title: I can't see my tables
---

# I can't see my tables

You've connected Metabase to a database, but:

- you don't see the tables in the [Table Metadata](../data-modeling/metadata-editing.md) section of the Admin Panel,
- the tables don't appear in the [Data Browser](https://www.metabase.com/learn/getting-started/data-browser),
- the tables don't show up as possible data sources when you create a query using the Query Builder, or
- you can no longer see tables that you used to be able to see.

## Check for browser issues

1. Clear your browser cache.
2. Check if a browser extension or plugin is interfering with Metabase:
   - Disable all extensions and plugins,
   - Open Metabase in an incognito browser session, or
   - Open Metabase in a different browser.

**Explanation**

Sometimes your browser will show an old cached list of tables. Browser extensions can also prevent pages from loading correctly.

## Test the database connection

1. Go to the Metabase [SQL editor](../questions/native-editor/writing-sql.md).
2. Test the connection to your database by running:
   ```
   SELECT 1
   ```

If you get an error, see [Troubleshooting database connections](./db-connection.md).

**Explanation**

Something may have changed on the database side (if you were previously connected). For example, you may have connected to a test database while doing an evaluation but are now in a production environment.

## Check table access

To make sure that your table is actually queryable by Metabase:

1. Go to the Metabase [SQL editor](../questions/native-editor/writing-sql.md).
2. Look for your table:
   ```
   SELECT *
   FROM your_table
   ```

If there's a problem with your table name or database permissions, you'll get an error message like:

- [Table not found](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-syntax#column-or-table-name-is-not-found-or-not-recognized)
- [Permission denied](./data-permissions.md#getting-a-permission-denied-error-message)

For less common errors, try searching or asking the [Metabase community](https://discourse.metabase.com/).

**Explanation**

Something might have changed on database side: your table could've been renamed or dropped, or the permissions revoked.

## Metabase permissions

If there are only a few people who can't view tables, see [A user group has the wrong access to a table or schema](./data-permissions.md#a-user-group-has-the-wrong-access-to-a-table-or-schema).

**Explanation**

Metabase uses a group-based permission model: people belong to groups, and admins can set permissions to hide tables from groups.

## Check if the table is hidden

1. Go to **Admin > Table Metadata** and choose the database where your table is.
2. Check that **Visibility** of your table is not set to **Hidden**.

**Explanation**

If an Admin sets the table visibility to **Hidden**, you will be able to use SQL to query the table but will not be able to see it in **Browse** > **Databases** or as a data source in the Query Builder.

## MongoDB

MongoDB lets you "successfully connect" to any collection name, even if the collection doesn't exist. If you don't see a MongoDB collection in Metabase, make sure that:

- you have the correct collection name, and
- the collection is non-empty.

## Related topics

- [Table visibility](../data-modeling/metadata-editing.md#table-visibility).
- [My data sandboxes aren't working](./sandboxing.md).
- [I can't view or edit a question or dashboard](./cant-view-or-edit.md).
- [My visualizations are wrong](./visualization.md).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
