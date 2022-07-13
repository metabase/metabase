---
title: Troubleshooting data permissions
---

# Troubleshooting data permissions

If a person has the wrong level of access to the data that's returned by a question or query, you may need to troubleshoot different levels of [data permissions][data-permissions], starting from the most granular.

## Row and column permissions

- [Troubleshooting data sandboxing][troubleshooting-data-sandboxing].

## Native query (SQL) permissions

- [People can't access the SQL editor](#people-cant-access-the-sql-editor).
- [People with SQL permissions can see data that should be restricted by a data sandbox](./sandboxing.html#is-the-question-written-in-sql).
- [People can't _view_ native SQL questions when a block permission is applied to "All Users"](https://github.com/metabase/metabase/issues/21695).

## Table or schema permissions

- [People have the wrong access to a table or schema](#cant-restrict-access-to-a-table-or-schema).
- [People have collection permissions that override their data permissions](#people-have-collection-permissions-that-override-their-data-permissions).
- [Permission denied to a table or schema](#troubleshooting-database-permissions).
- [Checking someone's access to a table or schema](#checking-someones-access-to-a-table-or-schema).

## Common data permission issues

### People can't access the SQL editor

1. Disable browser extensions and refresh the browser to check if a script is being blocked.
2. Go to **Admin** > **Permissions** and select the user group.
3. Find the database that you want to grant SQL access to.
4. Select **Unrestricted** from the **Data access** dropdown.

**Explanation** 

To give people access to the [native SQL editor][native-query-editing], you must grant **Unrestricted** access to the database.

For more information about the different types of database permissions, check out the [section on data access][data-access] in our permissions documentation.

### People have the wrong access to a table or schema 

1. Go to **Admin** > **People** and check if the person is in [more than one group with conflicting permissions][group-permissions].
2. If the person is in multiple groups:
    - Remove the person from the group with wider permissions, or
    - Go to **Admin** > **Permissions** and change the **Data access** permission type.

**Explanation** 

If a person is a member of multiple [groups][groups], Metabase will grant the _most permissive_ level of access across all the groups in which they're a member.

For example, if a person is a member of two groups — one which grants [Unrestricted][unrestricted] access to a database or table and another that grants [No self-service][no-self-service] access — that person will have full unrestricted access.

Remember that everyone is a member of the **All Users** group. We recommend you revoke permissions from the **All users** group, and create new groups to selectively apply permissions to your data sources.

### People have collection permissions that override their data permissions

{% include plans-blockquote.html %}

1. Go to **Admin** > **Permissions** and select the user group.
2. Select the database or table that you want to restrict.
3. Choose **Block** from the dropdown.
4. Click **Save**.

**Explanation**

Since Metabase operates with two types of permissions — data permissions and collection permissions — even if you've granted a user group no self-service access to a database or table, they can still view saved questions and dashboards that draw on that database, as long as those questions and dashboards live in a collection they have access to. Unless a user group's access to a given database is set to “block," they’ll be able to view any saved question based on that data if they have access to the collection it’s saved in.

If you're running a [paid version of Metabase](https://www.metabase.com/pricing), you can block group access to an entire database. This means that if you've blocked a group's access to a database, members of that group will not ever seen any data from this database, regardless of their permissions at the Collection level.

### Permission denied to table or schema

If you get an error message that says something like "permission denied" or "table not found", you'll need to check if the Metabase application has permission to query your database.

1. Go to the SQL editor and run a basic query against the table or schema in question:
    ```
    SELECT 1
    FROM <your table>;
    ```
2. Get your Metabase's database credentials. You can find the information from **Admin** > **Databases** > **< Your database >** > **Connection string**.
3. Run the same query using a different application (such as your CLI or database IDE) using Metabase's database credentials.
4. If you cannot access the table or schema in step 1 and 3, ask your database admin to:
    - Grant permissions to the role that Metabase is using to connect, or
    - Provide a new set of database credentials.

**Explanation** 

Your database has its own set of permissions that are configured for each person (or application) that logs in. The database permissions can block Metabase from connecting to certain schemas or tables, regardless of the permissions you've set up on the Metabase side. Check with your database admin if you're not sure.

### Checking someone's access to a table or schema

1. Open an incognito browser window.
2. Log in to Metabase as the person in question.
3. Run a question, dashboard, or native query to confirm that the person can see the data they're supposed to.

## Further reading

- [Permissions overview][admin-permissions].
- [Collection permissions][collection-permissions].
- [Data permissions][data-permissions].
- [Permissions tutorials][learn-permissions] in Learn Metabase.

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known bugs or limitations][known-issues].

[admin-permissions]: ../administration-guide/05-setting-permissions.html
[collection-permissions]: ../administration-guide/06-collections.html
[data-access]: /administration-guide/data-permissions.html#data-access
[data-permissions]: ../administration-guide/data-permissions.html
[discourse]: https://discourse.metabase.com/
[groups]: ../administration-guide/04-managing-users.html#groups
[group-permissions]: ../administration-guide/05-setting-permissions.html#key-points-regarding-permissions
[known-issues]: ./known-issues.html
[learn-permissions]: /learn/permissions/index.html
[native-query-editing]: ../administration-guide/data-permissions.html#native-querying
[no-self-service]: ../administration-guide/data-permissions.html#no-self-service-access
[troubleshooting-data-sandboxing]: ./sandboxing.html
[troubleshooting-permissions]: ./permissions.html
[unrestricted]: ../administration-guide/data-permissions.html#unrestricted-access