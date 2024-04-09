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

Data access levels determine which data people can use to ask _new_ questions. Data access is distinct from [collection permissions](./collections.md), which determine which existing things people can view: dashboards, questions, and models. Metabase provides both blunt and sharp tools for you to set up data permissions that suit your needs.

You can click on any cell in the permissions table to change a group’s access level. When you’re done making your changes, just click the **Save changes** button in the top-right, and you’ll see a confirmation dialog summarizing the changes.

Metabase provides different types of data access:

- [Unrestricted](#unrestricted-access) (including native/SQL editing access)
- [Granular](#granular-access) (which includes Sandboxed access)
- [No self-service](#no-self-service-access)
- [Impersonation](#impersonation-access)
- [Block](#block-access)

## Unrestricted access

Members of the group can create questions using the graphical query builder on data from all tables (within all namespaces/schemas, if your database uses those), including any tables that might get added to this database in the future.

To grant a group the ability to write native/SQL questions or create [actions](../actions/start.md), you must additionally set [Native query editing](#native-query-editing) to **Yes**.

## Granular access

**Granular access** allows administrators to explicitly set data access to tables or schemas within a database, with "data access" here meaning the ability to create questions using the graphical query builder. In practice, this means that:

- Admins can set the group's access to individual tables to either **Unrestricted**, **No self-service**, or **Sandboxed** access.
- If a new table gets added to this database in the future, the group won't get access to that new table. An administrator would need to explicitly grant access to that table.

Note that [Block](#block-access) access is unavailable for individual tables/schemas. Block is a database-level setting; you can only block the entire database.

## No self-service access

**No self-service** prevents people in a group from using the graphical query builder to create new questions that query that database, or from seeing this database in the Browse Data section of your Metabase. Groups with No self-service access can still see saved questions that query this data if they 1) have access to the appropriate collection, and 2) aren't in a group with [blocked access](#block-access) to the database.

## Impersonation access

{% include plans-blockquote.html feature="Impersonation access" %}

> For now, impersonation access is only available for PostgreSQL, Redshift, and Snowflake.

**Impersonation access** allows you to associate user attributes with database-defined roles and their privileges. Metabase queries made by people with attributes that you define will respect the grants given to the database roles.

You can use impersonation to give people access to the native/SQL editor, while at the same time restricting their access to data based on a specific database role. And not just table-level access, but row-level access---or however you define access for that role in your database. Effectively what this means is that you can use impersonation to set up data sandbox-like access to your data, while letting people use the SQL editor to query that data. The difference is that, instead of setting up a data sandbox in Metabase, you need to set up that row-level security via the privileges granted to a role in your database.

When you connect Metabase to a database, Metabase uses the database user account you provided that has one or more database roles. When you give a group in Metabase unrestricted access to a database, that group will have the same privileges as the user account that you used to connect Metabase to that database.

If instead you want to give a group SQL access to some, but not all, of the schemas or tables in that database, you can create an additional role in your database that only includes a subset of those tables---or even specific row-level access---and then use Metabase's impersonation feature to associate a user attribute with that role. Essentially what Metabase will do is take the user attribute and pass that attribute as a string into a `SET ROLE` or `USE ROLE` command for the database _before_ Metabase executes the query.

Connection impersonation does not apply to people in the Metabase admins group, as their more permissive privileges take precedence.

### Setting up connection impersonation

> **For impersonation to work for Redshift databases, the user account Metabase uses to [connect to your Redshift database](../databases/connections/redshift.md) must be a superuser, as Metabase will need to be able to run the [SET SESSION AUTHORIZATION](https://docs.aws.amazon.com/redshift/latest/dg/r_SET_SESSION_AUTHORIZATION) command, which can only be run by a database superuser.

**In your database:**

- Create a new role (in Redshift, this would be a new user).
- Grant that role privileges.

For exactly how to create a new role in your database and grant that role privileges, you'll need to consult your database's documentation. We also have some docs on [users, roles, and privileges](../databases/users-roles-privileges.md) that can help you get started.


**In your Metabase:**

- Create a [new group](../people-and-groups/managing.md#groups), or select an existing group.
- Assign a [user attribute](../people-and-groups/managing.md#adding-a-user-attribute) to people in that group. You'll use this user attribute to associate people in that group with a role that you created in your database. For example, if you created a role named `sales` in your database with access to a subset of tables relevant to the sales team, you would add a user attribute called `db_role` (or whatever you want to call the attribute) and assign the value `sales` to the person's `db_role`. The value of the attribute (`sales` in this case) should match the name of the role in your database. Only some databases enforce case sensitivity, so you might want to make sure the attribute's value and the database's role match exactly.
- Next, you'll need to apply the impersonation access to that group. Go to **Admin settings** > **Permissions** > **Data**.
- Select the database you want to set permissions on.
- Find the group that you want to associate with the database role you created. Under **Data access** for that group, select **Impersonation**.
- From the dropdown, select the user attribute that you added that maps to the role you want the group to use when querying the database.
- Save your changes.

Two things to keep in mind with connection impersonation:

- Metabase gives people the most permissive access to data across all of their groups. So if a person is in one group with impersonated access that limits what they can see, and one group with unrestricted access to the same data source, the unrestricted access would override the impersonated access.
- People in a group with impersonation access to data do not necessarily share the same privileges. Metabase will use whatever role you specify in the user attribute for each person. E.g., if you select the `db_role` attribute for impersonation, one person's `db_role` could be `sales`, another person's could be `engineering`, or whatever other value that maps to a valid role in your database.

## Block access

{% include plans-blockquote.html feature="Block access" %}

**Block** ensures people in a group can’t see the data from this database, regardless of their permissions at the collection level.

Even if a question is in a collection that the group has access to, but that question queries a database that is blocked for that group, people in that group won't be able to view that question _unless_ they're in another group with the relevant data permissions. Essentially, what Block does is make collections permissions insufficient to view a question.

If a person in that blocked group belongs to _another_ group that _does_ have the corresponding data access, that more privileged access will take precedence (overruling the block), and they'll be able to view that question.

"Corresponding data access" here refers to whether the saved question was created using the graphical query builder, or the native/SQL editor, as the required permissions to overrule a block differ depending on how the question was created.

- If the question was created using the [graphical query builder](../questions/query-builder/introduction.md), the person would also need to be in a group with **Unrestricted data access** or **Sandboxed access** to the relevant database (or table) to view that question.
- If the question was created using the [native/SQL editor](../questions/native-editor/writing-sql.md), the person would need to be a member of a group with both **Unrestricted data access** and **Native query editing** set to **YES** to view that question.

## Table permissions

When you select [Granular access](#granular-access) for a database, you'll be prompted to set permissions on the tables (or schemas) within that database. Here you'll have some options, which differ depending on your Metabase plan.

### Unrestricted access to the table

Groups with unrestricted access can use the [graphical query builder](../questions/query-builder/introduction.md) to ask questions about this table.

### No self-service access to the table

Groups with no self-service access to a table can’t access the table at all. They can, however, view questions that use data from that table, provided the group has access to the question's collection, and they're not in a group with [blocked access](#block-access) for that table's database.

### Sandboxed access to the table

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
- [Users, roles, and privileges](../databases/users-roles-privileges.md)

[collections]: ./collections.md
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[data-sandboxing]: ./data-sandboxes.md
[permissions-overview]: ./introduction.md
[sandbox-columns]: https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions.html
[sandbox-rows]: https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions.html
[sql-snippet-folders]: ../questions/native-editor/sql-snippets.md
