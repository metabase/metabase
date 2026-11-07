---
title: Data permissions
redirect_from:
  - /docs/latest/administration-guide/data-permissions
---

# Data permissions

This page covers permissions for databases and tables. If you haven't already, check out our [Permissions introduction][permissions-introduction].

## Setting permissions on a database, schema, or table

To set data permissions on a database, schema, or table for a group:

1. Hit Cmd/Ctrl + K. Search for **Permissions** and click on the Permissions settings result. Metabase will default to the **Data** tab.

Or

1. Click the **grid** icon in the upper right.

2. Select **Admin**.

3. Click on the **Permissions** tab, which defaults to the **Data** tab.

You can view permissions either by group or by database.

## Data permission types

You can set the following types of permissions on a database, schema, or table:

- [View data](#view-data-permissions)
- [Create queries](#create-queries-permissions)
- [Download results](#download-results-permissions)
- [Manage table metadata](#manage-table-metadata-permissions)
- [Manage database](#manage-database-permissions)
- [Transforms](#transform-permissions)

If you need to change the target database based on who is logged in, check out [Database routing](./database-routing.md). Database routing is particularly useful when each of your customers has their own database.

## Before you apply specific permissions, block the All Users group

Before you apply more specific permissions, you'll want to make sure that no one can see any data. Since everyone's automatically in the All Users group, you'll want to block this group from seeing any data.

In **Admin** > **Permissions** > **Data**, block the All Users group's access to the database.

The **Blocked** setting is only available on Pro and Enterprise plans. On the open-source version, set the All Users group's **Create queries** permission to **No**, and use [collection permissions](./collections.md) to control which questions and dashboards people can see.

From there, you can selectively grant privileges to different groups.

## Default permissions for new groups and databases

When you create a group, Metabase bases the new group's data permissions on the All Users group. For each database, the new group gets the All Users group's most restrictive **Create queries** and **Download results** settings. On Pro and Enterprise plans, the new group's **View data** permission is **Blocked** for any database where the All Users group has Blocked, Impersonated, or Row and column security permissions, and **Can view** everywhere else. New groups start with **No** for **Manage table metadata** and **Manage database**.

When you add a database, Metabase bases each group's permissions for the new database on that group's most restrictive settings for your other databases. On Pro and Enterprise plans, if a group has Blocked, Impersonated, or Row and column security permissions for any database, that group's View data permission for the new database is Blocked. No group can manage the new database's table metadata or settings until you give the group those permissions.

[Tenant groups](../embedding/tenants.md#group-types), including the **All tenant users** group, always get the least access to a new database: View data is Blocked, and every other data permission is No. You also can't give tenant groups the Manage table metadata or Manage database permissions.

## View data permissions

{% include plans-blockquote.html feature="View data permissions" %}

The **View data** permission determines what data people can see when viewing questions, dashboards, models, and metrics. To [browse databases](../exploration-and-organization/exploration.md#browse-your-databases), a group will also need [Create queries](#create-queries-permissions) permissions for the relevant data.

Permission levels include:

- [Can view](#can-view-data-permission)
- [Granular](#granular-view-data-permission)
- [Row and column security](#row-and-column-security)
- [Impersonated](#impersonated-view-data-permission)
- [Blocked](#blocked-view-data-permission)

View data permission settings apply to different levels in your database:

| View data permission    | Database | Schema | Table |
| ----------------------- | -------- | ------ | ----- |
| Can view                | ✅       | ✅     | ✅    |
| Granular\*              | ✅       | ✅     | ❌    |
| Row and column security | ❌       | ❌     | ✅    |
| Impersonated            | ✅       | ❌     | ❌    |
| Blocked                 | ✅       | ✅     | ✅    |

\* The "Granular" setting is not itself a type of permission; it just signals that permissions are set at a level below the current level. For example, you can select "Granular" at a schema level to set permissions per table for tables in that schema.

In the free, open-source version of Metabase, the **View data** setting defaults to "Can view". Since the setting's options aren't available in the OSS version, Metabase will only display this **View data** setting in the Pro/Enterprise version.

For _which_ questions, models, and dashboards a group can view, instead see [collection permissions](collections.md).

### Can view data permission

{% include plans-blockquote.html feature="Can view data permission" %}

Setting to **Can view** means the group can view all the data for the data source, provided they have [collection permissions](./collections.md) to view questions, models, and dashboards.

In order to view the data in the [Browse databases](../exploration-and-organization/exploration.md#browse-your-databases) section, the group would additionally need to be able to [Create queries](#create-queries-permissions).

### Granular view data permission

{% include plans-blockquote.html feature="Granular view data permission" %}

This option lets you set View data permissions for individual schemas or tables. Available only for databases and schemas. If you select Granular for a database or schema, Metabase will open that data source and ask you to set permissions for each individual schema or table.

For tables, you can set **Can view**, **Row and column security**, or **Blocked**.

### Row and column security

{% include plans-blockquote.html feature="Row and column security" %}

Allows you to set row-level permissions based on user attributes, as well as custom views. Can only be configured at the table level.

See [Row and column security](./row-and-column-security.md).

### Impersonated view data permission

{% include plans-blockquote.html feature="Impersonated view data permission" %}

The **Impersonated** option lets you use a role in your database to specify what data people can view and query. Impersonation can only be set at the database level, as Metabase will defer to the permissions granted to the database role.

See [impersonated view data permissions](./impersonation.md)

### Blocked view data permission

{% include plans-blockquote.html feature="Blocked view data permission" %}

**Blocked** ensures people in a group can’t see the data from this database, schema, or table, regardless of their permissions at the collection level.

Blocked applies to the data. It stops a group from seeing results, and it doesn't hide the query definitions of questions that the group can otherwise view. Query definitions follow [collection permissions](./collections.md#collection-vs-data-permissions).

The Blocked view data permission can be set at the database, schema, or table level. Essentially, what Blocked does is make collections permissions _insufficient_ to view a question. For example, even if a question is in a collection that the group has access to, but that question queries a data source that is Blocked for that group, people in that group won't be able to view that question _unless_ they're in another group with the data permissions to that data source.

Setting blocked access for a group ALWAYS prevents the group from viewing questions built with the native query editor that query ANY tables from the same database. So even if you only block a single table in a database, the group won't be able to view the results of SQL questions that query ANY table in that database. The reason: Metabase doesn't (yet) parse SQL queries, so it can't know for sure whether the SQL queries the table you want to block.

If a person in a Blocked group belongs to _another_ group that has its View data permission set to "Can view", that more permissive access will take precedence, and they'll be able to view that question.

## Create queries permissions

Specifies whether a group can create new questions based on the data source. Creating queries includes the ability to drill-through and filter questions, or anything that involves changing the results. This permission also determines whether a group will get access to the [database browser](../exploration-and-organization/exploration.md#browse-your-databases) to explore that data source.

A group can't create queries on a data source if its View data permission for that data source is **Blocked**.

Create queries permissions control who can write and run queries. They don't hide the queries behind questions that already exist. A group without native query permissions can't write SQL, and won't see the **View SQL** button in the query builder, but they can still read the SQL of a saved native question in a collection they have access to. Metabase returns a question's query definition to anyone who can view that question. See [Collection vs data permissions](./collections.md#collection-vs-data-permissions).

Create query levels include:

### Query builder and native create queries permission

People can use Metabase's query builder or its native/SQL editor.

If a group has "Blocked" or "Row and column security" View data permissions for _any_ of the tables in the database, then this group will have native queries disabled for _all_ tables in that database. That's because Metabase can't parse SQL queries, so it can't know for sure whether the SQL queries are using the tables with restricted access.

Row and column security is an exception to the rule that people get the most permissive access across their groups. If row and column security applies to someone for any table in a database, that person can't use the native editor on that database, even if another one of their groups has **Query builder and native** permissions. And Metabase won't let you give **Query builder and native** permissions to a group that has row and column security on that database.

### Query builder only create queries permission

People can create new questions and drill-through existing questions using Metabase's query builder.

### Granular

The granular option lets you define Create queries permissions for each schema and/or table in the database. For each schema or table, you can choose **Query builder only** or **No**.

Native query access can only be set for a whole database, so when you switch a database from **Query builder and native** to **Granular**, the group loses native access to that database.

### No create queries permission

People can't create or edit questions, including drill-through. They can still view questions in collections they have access to, if their View data permissions allow it.

On Pro and Enterprise plans, tables published to the [Library](../data-modeling/semantic-layer/library.md#permissions-to-use-library-content) give query builder access to people who can view them in the Library, even if their group has Create queries set to No.

## Download results permissions

{% include plans-blockquote.html feature="Download permissions" is_plural=true %}

You can set permissions on whether people in a group can download results (and how many rows) from a data source. Options are:

- No (they can't download results)
- Granular (you want to set access for individual tables or schemas)
- 10 thousand rows
- 1 million rows

For native/SQL queries, a group's download permission is the lowest download level the group has for any table in the database. For example, if a group can download 1 million rows from some tables but only 10 thousand rows from others, people in that group can download up to 10 thousand rows from native queries on that database. If the group can't download results from even one table in the database, it can't download results from native queries on that database at all. This is because Metabase doesn't parse SQL queries, so it can't determine which tables are being queried.

If a group's View data permission is **Blocked**, Metabase sets the group's Download results permission to **No**.

## Manage table metadata permissions

{% include plans-blockquote.html feature="Data model permissions" is_plural=true  %}

You can define whether a group can [edit table metadata](../data-modeling/metadata/metadata-editing.md). Options are:

- Yes (meaning, they can edit metadata for that data source).
- No
- Granular (to set permissions specific to each table).

People in the [Data Analysts](../people-and-groups/managing.md#data-analysts) group can always edit table metadata for all tables, and you can't change that permission for the Data Analysts group.

If your Metabase uses [remote sync](../data-modeling/semantic-layer/remote-sync.md) in Read-only mode, no one (not even admins) can edit the metadata of tables published to a synced collection.

## Manage database permissions

{% include plans-blockquote.html feature="Database management permissions" is_plural=true %}

The **Manage database** permission grants access to the settings page for a given database (i.e., the page at **Admin** > **Databases** > your database).

On the database settings page, you can:

- Edit any of the [connection options](../databases/connecting.md) for the data source.
- [Sync schemas](../databases/sync-scan.md#manually-syncing-tables-and-columns).
- [Scan field values](../databases/sync-scan.md#manually-scanning-column-values).
- Discard the database's saved field values.

Note that only admins can delete database connections in your Metabase, so people with **Manage database** permissions won't see the **Remove this database** button.

## Revoke access even though "All Users" has greater access

If you see this modal pop-up, Metabase is telling you that the people in the All Users group (that is, everyone in your Metabase), have a higher level of access to the database, schema, or table that you're setting permissions on. To limit your current group to your preferred permission level, the All Users group must have a less permissive level of access to the data source in question.

## Upload permissions

See [Upload permissions](../databases/uploads.md#add-people-to-a-group-with-data-access-to-the-upload-schema).

## Transform permissions

{% include plans-blockquote.html feature="Transform permissions" is_plural=true %}

Transform permissions control who can manage and run [transforms](../data-modeling/transforms/transforms-overview.md) on a database. Transform permissions can only be set on a database level, not on a table level.

A group can only have transform permissions for a database if they also have "View data" and "Query builder and native" permissions for _all_ the tables in a database.

Transform permissions alone aren't enough: people also need to be admins or in the [Data Analysts](../people-and-groups/managing.md#data-analysts) group to use transforms. On self-hosted Metabases, the **Transforms** column only shows up once you [enable transforms](../data-modeling/transforms/transforms-overview.md#enable-transforms). See [Permissions for transforms](../data-modeling/transforms/transforms-overview.md#permissions-for-transforms).

## Further reading

- [Permissions introduction](./introduction.md)
- [Impersonation](./impersonation.md)
- [Learn permissions](https://www.metabase.com/learn/metabase-basics/administration/permissions)
- [Troubleshooting permissions](../troubleshooting-guide/permissions.md)
- [Users, roles, and privileges](../databases/users-roles-privileges.md)

[collections]: ./collections.md
[dashboard-subscriptions]: ../dashboards/subscriptions.md
[permissions-introduction]: ./introduction.md
[sql-snippet-folders]: ../questions/native-editor/snippets.md
