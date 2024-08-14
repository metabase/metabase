---
title: Troubleshooting sandbox access to rows and columns
---

# Troubleshooting sandbox access to rows and columns

[Sandboxing data][sandboxing-your-data] gives some people access to only a subset of the data. (The term comes from the practice of putting children in a sandbox to play safely.) To implement sandboxing, Metabase runs a query that filters rows and/or selects a subset of columns from a table based on [the person's permissions][permissions]; the person's query then runs on the initial query's result (i.e., it runs on the sandboxed data).

These articles will help you understand how sandboxing works:

- [Data Sandboxing: setting row-level permissions][row-permissions].
- [Advanced data sandboxing: limiting access to columns][column-permissions].

If you have a different data access issue, see [related problems](#do-you-have-a-different-problem).

## People can't see **rows** in a table they _should_ be able to see

### Is a sandbox filtering rows by a user attribute?

**Root cause:** A sandbox is using user attribute to filter rows.

**Steps to take:**

This is expected behavior: using a user attribute to filter rows for a sandboxed table is how sandboxing works. But if you _don't_ want Metabase to filter those rows, you'll need to either:

- Remove the sandbox (which would grant full access to all rows to everyone with access to that table). Go to **Admin** > **Permissions**, and change the access level for the table.
- Add the person to a group (or create a group) with different permissions to the table. Check out [Guide to data permissions][data-permissions].

## People can see **rows** they're _not_ supposed to see

There are several reasons people could be seeing rows that they're not supposed to see.

### Are those people also in groups with permission to view the entire table?

**Root cause:** People are in groups with permissions to view the table, and therefore can see all rows, not just the sandboxed rows.

**Steps to take:**

For the person in question, check to see which groups they belong to. Do any of the groups have access to the table you're trying to sandboxed? If so, remove them from that group. Remember that everyone is a member of the "All users" group; which is why we recommend you revoke permissions from the all users group, and create new groups to selectively apply permissions to your data sources.

### Is the question available via Static embedding or Public Sharing?

**Root cause**: The question is public. [Public questions][public-sharing], even those that use [Static embedding][static-embedding], can't be sandboxed. If someone views the question without logging into Metabase, Metabase lacks user attributes or group information for filtering the data, so it will show all results.

**Steps to take**:

You should _avoid_ public sharing when you are sandboxing data. See [public sharing][public-sharing].

### Is the question written in SQL?

**Root cause**. People with SQL access to a database cannot be sandboxed. They have as much access to the database as the user account used to connect Metabase to the database. Even if you hide tables in Metabase, someone with SQL access to a database would still be able to query those tables. Which is also to say that SQL questions cannot be sandboxed. Sandboxing exclusively applies to questions composed in the query builder (even though you can use a SQL question to create a sandbox, e.g., to create a result set of a table that excludes some columns)
.

**Steps to take**

- Don't try to sandbox a question written in SQL, because you can't.

- If you want to sandbox access, avoid adding the person to a group with SQL access to that table (or any other more permissive access to that table, for that matter).

- If you want to give them SQL access, but still limit what the person can see, you'll need to set up permissions in your database, and connect that database via the user account with that restricted access. You can connect the same database to Metabase multiple times, each with different levels of access, and expose different connections to different groups. But again, you won't be able to sandbox the data from a person with SQL access.

### Is the question retrieving data from a non-SQL data source?

**Root cause:** Data sandboxes do not support non-SQL databases.

**Steps to take:**

There is not much you can do here: if you need to sandbox data, [you can't use these databases][unsupported-databases].

### If using Single Sign-on (SSO), are user attributes correct?

**Root cause**: If people are logging in with SSO, but the expected attributes aren't being saved and made available, sandboxing will deny access.

**Steps to take**:

Our docs on [Authenticating with SAML][authenticating-with-saml] and [Authenticating with JWT][jwt-auth] explain how to use your identity provider to pass user attributes to Metabase, which (the user attributes) can be used to sandbox data.

## People can see **columns** they're _not_ supposed to see

### Did the administrator forget to set up a sandbox?

**Root cause:** The administrator didn't restrict access to the underlying table when setting up sandboxing.

**Steps to take**:

1. Go into **Admin Panel** > **Permissions** for the table in question.
2. Check that the sandbox exists, and that the question used to sandbox the table excludes the columns you don't want people to see.

### Does the question used to set up the sandbox include the columns?

**Root cause:** The question used to create the sandbox includes the columns they're not supposed to see.

**Steps to take**:

Make sure that you're using a SQL question to create the sandbox, and that you're not including columns you should be excluding.

If you build a question using the query builder (i.e., use a simple or custom question), you may unintentionally pull in additional columns. You can check exactly which columns are included by viewing the question in the Notebook Editor and clicking on the **View the SQL** button. But again: if you use SQL questions to sandbox the data, this problem goes away.

## Is the person in _another_ group with a different permission level for the table?

**Root cause:** You've sandboxed the table with the question, but the person is also in an group with a higher level of access to the table. If a person is in multiple groups, they'll get the most permissive access to a data source across all of their groups.

**Steps to take**:

Remove the person from all groups with higher level access to the sandboxed table. If they need some permissions from those other groups, you'll need to create a new group with a new set of permissions that only has sandboxed access to the table in question.

## People can't see **columns** they _should_ be able to see

### Do they only have sandboxed access to the table?

**Root cause:** They only have access to a sandboxed version of the table, where only some columns are shown.

**Steps to take**:

Add these people to a group (or create a new group) that has permissions to view the table.

### Has an administrator hidden fields in the table?

**Root cause:**: An administrator has hidden fields in the table.

**Steps to take:**

Go to **Admin** > **Table Metadata** and find the table. Check to make sure that the fields you want to make visible are not hidden.

### Is a field remapped to display info from a restricted table?

**Root cause:** If a table which the person _does_ have sandboxed access has a field that uses remapping to display information from another table which the person lacks sandboxed access to, they won't be able to see the table. For example, if you have remapped an ID field to display a product's name instead, but the person lacks access to the product table, they won't be able to see the column.

**Steps to take:**

1. Go to **Admin Panel** > **Table Metadata** for the fields in question.
2. If the value is remapped from a restricted table, change it so that Metabase will use the original value from the table. See [Metadata editing][data-model] for more information.

### Is the question available via static embedding?

**Root cause**: [Static embedding][static-embedding] will show all results by default. While it's possible to control filtering with [locked parameters][locked-parameters], static embedding depends only on the token generated by the including page, not whether someone is logged into Metabase.

**Steps to take**:

Since someone must log in so that Metabase can apply sandboxed views to that person, avoid using static embedding when you want to restrict row or column access to a table.

## People can't see data they're supposed to be able to see

Someone is supposed to be able to view some of the values in a table in their queries, but are denied access or get an empty set of results where there should be data.

**Root cause**: The administrator restricted access to the table. Administrators usually restrict access to tables as part of sandboxing; if the restrictions are too tight by mistake (e.g., "no access") then people might not be able to see any data at all.

**Steps to take:**

1. Check the access level for the groups by going to **Admin Panel** and viewing **Permissions** for the table in question.
2. If the person isn't in a group with access to that table, add them to a group that does, or create a new group with access to that table and add them to that new group.

## Is the person who can't see the sandboxed data in multiple groups?

**Root cause:** We only allow one sandbox per table: if someone is a member of two or more groups with different permissions, every rule for figuring out whether access should be allowed or not is confusing. We therefore only allow one rule.

**Steps to take:**

The administrator can [create a new group][groups] to capture precisely who's allowed access to what.

## Do you have a different problem?

- [I have a different permissions issue][troubleshooting-permissions].
- [I can't see my tables][cant-see-tables].

[authenticating-with-saml]: ../people-and-groups/authenticating-with-saml.md
[cant-see-tables]: cant-see-tables.md
[column-permissions]: https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions
[data-model]: ../data-modeling/metadata-editing.md
[data-permissions]: https://www.metabase.com/learn/permissions/data-permissions
[groups]: ../people-and-groups/managing.md#groups
[jwt-auth]: ../people-and-groups/authenticating-with-jwt.md
[locked-parameters]: https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards#hide-or-lock-parameters-to-restrict-what-data-is-shown
[permissions]: https://www.metabase.com/learn/permissions/data-permissions
[public-sharing]: ../questions/sharing/public-links.md
[row-permissions]: https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions
[sandboxing-your-data]: ../permissions/data-sandboxes.md
[static-embedding]: https://www.metabase.com/learn/metabase-basics/embedding/charts-and-dashboards#enable-embedding-in-other-applications
[sandbox-limitations]: ../permissions/data-sandboxes.md#limitations
[troubleshooting-permissions]: ./permissions.md
[unsupported-databases]: ../permissions/data-sandboxes.md#limitations
