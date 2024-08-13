---
title: Troubleshooting data permissions
---

# Troubleshooting data permissions

If a person has the wrong level of access to the data that's returned by a question or query, you'll need to troubleshoot different levels of [data permissions][data-permissions], starting from the most granular.

### Row and column permissions

- [Troubleshooting data sandboxing][troubleshooting-data-sandboxing].

### Native query (SQL) permissions

- [A user group can't access the SQL editor][sql-access].
- [A user group with SQL permissions isn't being restricted by their data sandbox][sql-sandboxing].

### Table or schema permissions

- [A user group has the wrong access to a table or schema](#a-user-group-has-the-wrong-access-to-a-table-or-schema).
- [A user group can view collections that contain restricted data](#a-user-group-can-view-collections-that-contain-restricted-data).
- [Getting a "permission denied" error message](#getting-a-permission-denied-error-message).
- [Checking someone's access to a table or schema](#checking-someones-access-to-a-table-or-schema).

## A user group can't access the SQL editor

1. Ensure scripts are loading by disabling browser extensions and refreshing the browser.
2. Go to **Admin** > **Permissions** and select the relevant group.
3. Find the database that you want to grant SQL access to.
4. From the **View data** dropdown.elect **Can view**.
5. From the **Create queries** dropdown, select **Query builder and native**.
6. [Check if the access problem is fixed](#checking-someones-access-to-a-table-or-schema).

For more information about the different types of database permissions, check out the [section on data access][data-access] in our permissions documentation.

## A user group has the wrong access to a table or schema

1. Go to **Admin** > **People** and check if the person is in [more than one group with conflicting permissions][group-permissions].
2. If the person is in multiple groups:
   - Remove the person from the group with wider permissions, or
   - Go to **Admin** > **Permissions** and change the **Data access** permission type.
3. [Check if the access problem is fixed](#checking-someones-access-to-a-table-or-schema).

**Explanation**

If a person is a member of multiple [groups][groups], Metabase will grant the _most permissive_ level of access across all the groups in which they're a member.

For example, if a person is a member of two groups — one which grants [View data] access of "Can view" to a database or table and another that grants "Blocked" access to that database — that person will be able to view the data.

Remember that everyone is a member of the **All Users** group. We recommend you revoke permissions from the **All Users** group, and create new groups to selectively apply permissions to your data sources.

## A user group can view collections that contain restricted data

{% include plans-blockquote.html %}

1. Go to **Admin** > **Permissions** and select the user group.
2. Select the database or table that you want to restrict.
3. Set **View data** permissions to **Blocked** and click **Save**.
4. [Check if the access problem is fixed](#checking-someones-access-to-a-table-or-schema).

**Explanation**

If you've granted a group View data access of "Can view" to a database or table, people can view saved questions and dashboards that draw on that database, as long as those questions and dashboards are stored in a collection that they have access to.

The [**Blocked** data permission][block-data-permission] is available on [Pro and Enterprise versions of Metabase][pricing]. If you block a group's access to a database, members of that group will not be able to see any data from this database, regardless of their collection permissions.

## Getting a "permission denied" error message

If you get an error message that says something like "permission denied to \<your table\>", you'll need to check if the Metabase application has the correct permissions to query your database.

1. Go to the SQL editor and run a basic query against the table or schema in question:
   ```
   SELECT 1
   FROM <your table>;
   ```
2. Get the credentials that Metabase uses to connect to your database. If you're not sure what those credentials are, ask your database admin.
3. Using a different application (like your CLI or database IDE), connect to your database using the same credentials your Metabase uses to connect to that database, and run the query from step 1.
4. If you cannot access the table or schema in both step 1 and 3, ask your database admin to:
   - [Grant database privileges](../databases/users-roles-privileges.md) to the role that Metabase is using to connect, or
   - Provide a set of database credentials with the correct permissions.
5. [Check if the access problem is fixed](#checking-someones-access-to-a-table-or-schema).

**Explanation**

Your database has its own set of permissions that are configured for each person (or application) that logs in.

Database permissions apply at the level of your database connection, _before_ your data and collection permissions are applied in Metabase.

This means that settings configured on the database side can prevent Metabase from connecting to certain schemas or tables, regardless of what you've set up on the Metabase side.

## Checking someone's access to a table or schema

1. Open an incognito browser window.
2. Log in to Metabase as the person in question.
3. Run a question, dashboard, or native query to confirm that the person can see the data they're supposed to.

## Do you have a different problem?

- [I can't view or edit my question or dashboard][view-edit].
- [I can't save my question or dashboard][proxies].
- [I can't see my tables][cant-see-tables].

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[admin-permissions]: ../permissions/introduction.md
[block-data-permission]: ../permissions/data.md#blocked-view-data-permission
[cant-see-tables]: ./cant-see-tables.md
[collection-permissions]: ../permissions/collections.md
[data-access]: ../permissions/data.md#data-permission-types
[data-permissions]: ../permissions/data.md
[discourse]: https://discourse.metabase.com/
[groups]: ../people-and-groups/managing.md#groups
[group-permissions]: ../permissions/introduction.md#key-points-regarding-permissions
[known-issues]: ./known-issues.md
[learn-permissions]: https://www.metabase.com/learn/permissions
[native-query-editing]: ../permissions/data.md#query-builder-and-native-create-queries-permission
[pricing]: https://www.metabase.com/pricing
[proxies]: ./proxies.md
[sql-access]: ./data-permissions.md#a-user-group-cant-access-the-sql-editor
[sql-sandboxing]: ./sandboxing.md#is-the-question-written-in-sql
[troubleshooting-data-sandboxing]: ./sandboxing.md
[troubleshooting-permissions]: ./permissions.md
[unrestricted]: ../permissions/data.md#can-view-data-permission
[view-edit]: ./cant-view-or-edit.md
