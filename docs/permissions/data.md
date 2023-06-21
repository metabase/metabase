---
title: Data permissions
redirect_from:
  - /docs/latest/administration-guide/data-permissions
---

# Data permissions

This page covers permissions for databases and tables. If you haven't already, check out our [Permissions overview][permissions-overview].

## Permissions view

Now that you have some groups, you’ll want to control their data access by going to **Admin settings** > **Permissions**. You’ll see an interactive table that displays all of your databases and all of your groups, and the level of access your groups have for each database.

## Setting permissions on a database

You can set various levels of permissions on a data source, from querying access to managing the database connection.

- [Data access](#data-access)
- [Native querying](#native-query-editing)
- [Download results](#download-results)\*
- [Manage table metadata](#manage-table-metadata)\*
- [Manage database](#manage-database)\*

\* Available on paid plans.

## Data access

You can click on any cell in the permissions table to change a group’s access level. When you’re done making your changes, just click the **Save changes** button in the top-right, and you’ll see a confirmation dialog summarizing the changes.

### Unrestricted access

Members of the group can create questions using the graphical query builder on data from all tables (within all namespaces/schemas, if your database uses those), including any tables that might get added to this database in the future.

To grant a group the ability to write native/SQL questions or create [actions](../actions/start.md), you must additionally set [Native query editing](#native-query-editing) to **Yes**.

### Granular access

**Granular access** allows administrators to explicitly set data access to tables or schemas within a database, with "data access" here meaning the ability to create questions using the graphical query builder. In practice, this means that:

- Admins can set the group's access to individual tables to either **Unrestricted**, **No self-service**, or **Sandboxed** access.
- If a new table gets added to this database in the future, the group won't get access to that new table. An administrator would need to explicitly grant access to that table.

Note that [Block](#block-access) access is unavailable for individual tables/schemas. Block is a database-level setting; you can only block the entire database.

### No self-service access

**No self-service** prevents people in a group from using the graphical query builder to create new questions that query that database, or from seeing this database in the Browse Data section of your Metabase. Groups with No self-service access can still see saved questions that query this data if they 1) have access to the appropriate collection, and 2) aren't in a group with [blocked access](#block-access) to the database.

### Block access

{% include plans-blockquote.html feature="Block access" %}

**Block** ensures people in a group can’t see the data from this database, regardless of their permissions at the collection level.

Even if a question is in a collection that the group has access to, but that question queries a database that is blocked for that group, people in that group won't be able to view that question _unless_ they're in another group with the relevant data permissions. Essentially, what Block does is make collections permissions insufficient to view a question.

If a person in that blocked group belongs to _another_ group that _does_ have the corresponding data access, that more privileged access will take precedence (overruling the block), and they'll be able to view that question.

"Corresponding data access" here refers to whether the saved question was created using the graphical query builder, or the native/SQL editor, as the required permissions to overrule a block differ depending on how the question was created.

- If the question was created using the [graphical query builder](../questions/query-builder/introduction.md), the person would also need to be in a group with **Unrestricted data access** or **Sandboxed access** to the relevant database (or table) to view that question.
- If the question was created using the [native/SQL editor](../questions/native-editor/writing-sql.md), the person would need to be a member of a group with both **Unrestricted data access** and **Native query editing** set to **YES** to view that question.

### Table permissions

When you select [Granular access](#granular-access) for a database, you'll be prompted to set permissions on the tables (or schemas) within that database. Here you'll have some options, which differ depending on your Metabase plan.

#### Unrestricted access to the table

Groups with unrestricted access can use the [graphical query builder](../questions/query-builder/introduction.md) to ask questions about this table.

#### No self-service access to the table

Groups with no self-service access to a table can’t access the table at all. They can, however, view questions that use data from that table, provided the group has access to the question's collection, and they're not in a group with [blocked access](#block-access) for that table's database.

#### Sandboxed access to the table

{% include plans-blockquote.html feature="Data sandboxing" %}

Sandboxed access to a table can restrict access to columns and rows of a table. Check out [data sandboxing][data-sandboxing].

## Native query editing

Members of a group with Native query editing set to "Yes" can:

- Write new SQL/native queries using the [native query editor](../questions/native-editor/writing-sql.md).
- Create and edit [custom actions](../actions/custom.md).

This access level requires the group to additionally have Unrestricted data access for the database in question, since SQL queries can circumvent table-level permissions.

People in a group without Native query editing permissions will still be able to view the results of questions created from SQL/native queries (though just the results, not the query), or run an action, provided they 1) have collection access to the question or model, and 2) it doesn't query a database that is [blocked](#block-access) for that group.

## Download results

{% include plans-blockquote.html feature="Download permissions" %}

You can set permissions on whether people in a group can download results (and how many rows) from a data source. Options are:

- No (they can't download results)
- Granular (you want to set access for individual tables or schemas)
- 10 thousand rows
- 1 million rows

## Manage table metadata

{% include plans-blockquote.html feature="Data model permissions" %}

You can define whether a group can [edit table metadata](../data-modeling/metadata-editing.md). Options are:

- Yes (meaning, they can edit metadata for that data source).
- No
- Granular (to set permissions specific to each table).

## Manage database

{% include plans-blockquote.html feature="Database management permissions" %}

The **Manage database** permission grants access to the settings page for a given database (i.e., the page at **Admin settings** > **Databases** > your database).

On the database settings page, you can:

- Edit any of the [connection options](../databases/connecting.md) for the data source,
- [sync schemas](../databases/sync-scan.md#manually-syncing-tables-and-columns), and
- [scan field values](../databases/sync-scan.md#manually-scanning-column-values).

Note that only admins can delete database connections in your Metabase, so people with **Manage database** permissions won't see the **Remove database** button.

## Further reading

- [Permissions introduction](./introduction.md)
- [Learn permissions](https://www.metabase.com/learn/permissions)
- [Troubleshooting permissions](../troubleshooting-guide/permissions.md)
- [Data sandboxing: setting row-level permissions][sandbox-rows]
- [Advanced data sandboxing: limiting access to columns][sandbox-columns]

[collections]: ./collections.md
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[data-sandboxing]: ./data-sandboxes.md
[permissions-overview]: ./introduction.md
[sandbox-columns]: https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions.html
[sandbox-rows]: https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions.html
[sql-snippet-folders]: ../questions/native-editor/sql-snippets.md
