---
title: Data permissions
---

# Data permissions

This page covers permissions for databases and tables. If you haven't already, check out our [Permissions overview][permissions-overview].

## Permissions view

Now that you have some groups, you’ll want to control their data access by going to **Admin settings** > **Permissions**. You’ll see an interactive table that displays all of your databases and all of your groups, and the level of access your groups have for each database.

## Setting permissions on a database

You can set various levels of permissions on a data source, from querying access to managing the database connection.

- [Data access](#data-access)
- [Native querying](#native-querying)
- [Download results](#download-results)\*
- [Manage data model](#manage-data-model)\*
- [Manage database](#manage-database)\*

\* Available on paid plans.

## Data access

You can click on any cell in the permissions table to change a group’s access level. When you’re done making your changes, just click the **Save changes** button in the top-right, and you’ll see a confirmation dialog summarizing the changes.

### Unrestricted access

Members of the group can access data from all tables (within all namespaces/schemas, if your database uses those), including any tables that might get added to this database in the future.

### Granular access

**Granular access** allows administrators to explicitly set access to tables or schemas within a database. In practice, this means that:

- Admins can set the groups access to individual tables to either **Unrestricted**, **No self-service**, or **Sandboxed** access.
- If a new table gets added to this database in the future, the group won't get access to that new table. An administrator would need to explicitly grant access to that table.

### No self-service access

**No self-service** prevents people in a group from creating new ad hoc queries or questions based on this data, or from seeing this data in the Browse Data screen. Groups with this level of access can still see saved questions and charts based on this data in Collections they have access to.

### Block access

{% include plans-blockquote.html feature="Block access" %}

**Block** ensures people can’t ever see the data from this database, regardless of their permissions at the Collection level. So if they want to see a question in a collection that have access to, but that question uses data from a database that's been blocked for that person's group, then they won't be able to see that question.

Keep in mind people can be in multiple groups. If a person belongs to _another_ group that _does_ have access to that database, that more privileged access will take precedence (overruling the block), and they'll be able to view that question.

### Table permissions

When you select [Granular access](#granular-access) for a database, you'll be prompted to set permissions on the tables (or schemas) within that database. Here you'll have two or three options, depending on your Metabase plan.

#### Unrestricted access to the table

Groups with unrestricted access can ask questions about this table and see saved questions and dashboard cards that use the table.

#### No self-service access to the table

Groups with no self-service access to a table can’t access the table at all. They can, however, view questions that use data from that table, provided the group has access to the question's collection.

#### Sandboxed access to the table

{% include plans-blockquote.html feature="Data sandboxing" %}

Sandboxed access to a table can restrict access to columns and rows of a table. Check out [data sandboxing][data-sandboxing].

## Native querying

Members of a group with Native query editing set to Yes can write new SQL/native queries using the [native query editor](https://www.metabase.com/docs/latest/users-guide/writing-sql.html). This access level requires the group to additionally have Unrestricted data access for the database in question, since SQL queries can circumvent table-level permissions.

People who aren't in groups with Native query editing permissions will still be able to view the results of questions created from SQL/native queries, but not the code itself. They also won't see the **View the SQL** button in the query builder.

## Download results

{% include plans-blockquote.html feature="Download permissions" %}

You can set permissions on whether people in a group can download results (and how many rows) from a data source. Options are:

- No (they can't download results)
- Granular (you want to set access for individual tables or schemas)
- 10 thousand rows
- 1 million rows

## Manage data model

{% include plans-blockquote.html feature="Data model permissions" %}

You can define whether a group can [edit metadata](03-metadata-editing.md). Options are:

- Yes (meaning, they can edit metadata for that data source).
- No 
- Granular (to set permissions specific to each table).

## Manage database

{% include plans-blockquote.html feature="Database management permissions" %}

This setting defines whether a person can edit the connection settings for the data source, as well as to sync and scan the database. Note that this setting still prevents people from deleting database connections entirely. Only admins can delete database connections in your Metabase.

## Further reading

- [Permissions overview](05-setting-permissions.md)
- [Learn permissions](/learn/permissions)
- [Troubleshooting permissions](../troubleshooting-guide/permissions.md)
- [Data sandboxing: setting row-level permissions][sandbox-rows]
- [Advanced data sandboxing: limiting access to columns][sandbox-columns]

[collections]: 06-collections.md
[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.md
[data-sandboxing]: ../enterprise-guide/data-sandboxes.md
[permissions-overview]: 05-setting-permissions.md
[sandbox-columns]: /learn/permissions/data-sandboxing-column-permissions.html
[sandbox-rows]: /learn/permissions/data-sandboxing-row-permissions.html
[sql-snippet-folders]: ../enterprise-guide/sql-snippets.md