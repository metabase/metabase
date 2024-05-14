---
title: Impersonation access
---

# Impersonation permissions

{% include plans-blockquote.html feature="Impersonation access" %}

> For now, impersonation access is only available for PostgreSQL, Redshift, and Snowflake.

This page covers the [View data](./data.md#view-data-permissions) permission level called Impersonation.

**Impersonation access** allows admins to "outsource" View data permissions to roles in your database. Admins can associate user attributes with database-defined roles and their privileges. If someone is in a group with their View data permission set to Impersonation, the person will be able to view and query data based on the privileges granted to the role specified by their user attribute.

## Setting up connection impersonation

> **For impersonation to work for Redshift databases, the user account Metabase uses to [connect to your Redshift database](../databases/connections/redshift.md) must be a superuser, as Metabase will need to be able to run the [SET SESSION AUTHORIZATION](https://docs.aws.amazon.com/redshift/latest/dg/r_SET_SESSION_AUTHORIZATION) command, which can only be run by a database superuser.

For impersonation access to work, you'll first need to set up roles in your database for Metabase to impersonate, then configure Metabase to impersonate those roles when people view or query data.

### In your database, set up roles

1. Create a new role (in Redshift, this would be a new user).
2. Grant that role privileges.

For exactly how to create a new role in your database and grant that role privileges, you'll need to consult your database's documentation. We also have some docs on [users, roles, and privileges](../databases/users-roles-privileges.md) that can help you get started.

### In your Metabase, set up impersonation and specify a user attribute

1. **Create a [new group](../people-and-groups/managing.md#groups)**, or select an existing group.

2. **Assign a [user attribute](../people-and-groups/managing.md#adding-a-user-attribute) to people in that group.** You'll use this user attribute to associate people in that group with a role that you created in your database. For example, if you created a role named `sales` in your database with access to a subset of tables relevant to the sales team, you would add a user attribute called `db_role` (or whatever you want to call the attribute) and assign the value `sales` to the person's `db_role`. The value of the attribute (`sales` in this case) should match the name of the role in your database. Only some databases enforce case sensitivity, so you might want to make sure the attribute's value and the database's role match exactly.

3. **Apply the impersonation access to that group.**. Hit Cmd/Ctrl + K to bring up the command palette. Search for **Permissions**. Or go to **Admin settings** > **Permissions** > **Data**.

4. Select the database you want to set permissions on.

5. Find the group that you want to associate with the database role you created. Under **View data** setting for that group, select **Impersonation**.

6. From the dropdown, select the user attribute that you added that maps to the role you want the group to use when querying the database.

7. Save your changes.

## People in a group with impersonation access to data do not necessarily share the same privileges

Metabase will use whatever role you specify in the user attribute for each person. E.g., if you select the `db_role` attribute for impersonation, one person's `db_role` could be `sales`, another person's could be `engineering`, or whatever other value that maps to a valid role in your database.

## Use impersonation to set up row-level SQL access

You can use impersonation to give people access to the native/SQL editor, while restricting their access to data based on a specific database role. And not just table-level access, but row-level access---or however you define access for that role in your database. Effectively, you can use impersonation to set up data sandbox-like access to your data, while letting people use the SQL editor to query that data. The difference is that, _instead of setting up a data sandbox in Metabase, you need to set up that row-level security via the privileges granted to a role in your database._

If instead you want to give a group SQL access to some, but not all, of the schemas or tables in that database, you can create an additional role in your database that only includes a subset of those tables---or even specific row-level access---and then use Metabase's impersonation feature to associate a user attribute with that role. Essentially what Metabase will do is take the user attribute and pass that attribute as a string into a `SET ROLE` or `USE ROLE` command for the database _before_ Metabase executes the query.

Connection impersonation doesn't apply to people in the Metabase admins group, as their more permissive privileges take precedence.

For more about how to set this up, check out [Use Impersonation to get row-level permissions with both GUI and SQL queries](https://www.metabase.com/learn/permissions/impersonation).

## Metabase gives people the most permissive access to data across all of their groups

So if a person is in two groups with different permissions for the same database:

- Red group with impersonated access that limits what they can see.
- Blue group with View data set to "Can view" and Create queries set to "Query builder and native".

Red group's more permissive access would override the impersonated access.

## Further reading

- [Use Impersonation to get row-level permissions with both GUI and SQL queries](https://www.metabase.com/learn/permissions/impersonation)
