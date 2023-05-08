---
title: Data sandboxes
---

# Data sandboxes

{% include plans-blockquote.html feature="Data sandboxes" %}

Data sandboxes let you give granular permissions to rows and columns for different groups of people.

Say you have people who you want to be able to log into your Metabase, but who should only be able to view data that pertains to them. For example, you might want to display an Accounts table to some customers, but each customer should only be able to view the rows that match their customer ID. Sandboxes let you give people a way to self-serve their own analytics, without ever seeing any results that don't pertain to them.

Data sandboxes work by displaying an edited version of a table instead of the original table. You'll set up each sandbox (each edited version of a table) for  a specific group in your Metabase. That means Customer A will be able see one version of Accounts (filtered to A's data), and Customer B will see a different version of Accounts (B's data only).

## Types of data sandboxes

You can think of a data sandbox as a set of permissions that include:

- The edited version of a table that will replace the original table in Metabase.
- The [group](../people-and-groups/managing.md#groups) of people who should see the edited version of the table instead of the original table, everywhere that the table is used in Metabase.

You can define a data sandbox for each table and group pair in your Metabase. There are two basic types of sandboxes:

- A [row-restricting sandbox](#row-restricting-sandboxes) will display a filtered table in place of the original table (to a specific group).
- An [advanced sandbox](#advanced-sandboxes) will display a custom query result in place of the original table (to a specific group).

### Row-restricting sandboxes

A row-restricting sandbox displays the result of a filtered table based on a [user attribute](../people-and-groups/managing.md#adding-user-attributes). A group assigned to a row-restricting sandbox will see a version of the table with a filter like `Filter = "User Attribute"` applied to the original table.

For example, you can create a row-restricting sandbox to filter the Accounts table so that a person with the attribute "Basic" will see the rows where `Plan = "Basic"`, and a person with the attribute "Premium" will only see the rows where `Plan = "Premium"`.

### Advanced sandboxes

To **restrict or edit the columns** in a table (in addition to row-restriction), you'll have to use an advanced sandbox. An advanced sandbox displays the results of a saved question in place of a table, anywhere that the table is used in Metabase.

Say you create a saved question called "Sandboxed Accounts" that excludes the Email column from the Accounts table. An advanced sandbox can be used to display the "Sandboxed Accounts" result instead of the original Accounts table, everywhere that Accounts is used in Metabase.

Advanced sandboxes can also be set up to display edited columns. For example, you can replace a column of sensitive data with a column of hashed values.

## Limitations

**Groups with native query permissions (access to the SQL editor) cannot be sandboxed**.

**SQL questions cannot be sandboxed**. The results of a saved SQL question will always use your original tables. You'll have to use collection permissions to prevent sandboxed groups from viewing those SQL questions. See [Permissions conflicts: saved SQL questions](#saved-sql-questions).

**Data sandboxing is unavailable for non-SQL databases**, such as Google Analytics, Apache Druid, or MongoDB.

## Prerequisites for row-restricting data sandboxes

- A [group](../people-and-groups/managing.md#groups) of people to be added to the row-restricting data sandbox.
- [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each person in the group.

A row-restricting sandbox displays a filtered table in place of an original table to a specific group. The filter is set for each person in the group depending on the value of their user attribute. 

For example, a person with the attribute "Basic" will see the rows where `Plan = "Basic"`, and a person with the attribute "Premium" will only see the rows where `Plan = "Premium"`.

When [adding a new user attribute](../people-and-groups/managing.md#adding-a-user-attribute) for sandboxing, make sure that the **value** of the user attribute is an exact, case-sensitive match for the values in the column used to filter the Accounts table.

For example, if you're creating a row-restricting sandbox that only includes rows where the Plan column contains the value "Basic" (`Plan = "Basic"`), make sure that you enter "Basic" as the value for a user attribute. If you set the user attribute to lowercase "basic" (a value which doesn't exist in the Plan column), the sandboxed Accounts table will appear empty.

## Creating a row-restricting data sandbox

> Make sure to do the [prerequisites](#prerequisites-for-row-restricting-data-sandboxes) first.

1. Go to **Admin settings** > **Permissions**.
2. Select the database and table that you want to sandbox.
3. Find the group that you want to put in the sandbox.
4. Click on the dropdown under **Data access** for that group.
5. Select "Sandboxed".
6. Click the dropdown under **Column** and enter the filter name for your table, such as "Plan".
7. Click the dropdown under **User attribute** and enter the user attribute **key**, such as "User's Plan".

If you have existing saved SQL questions that use the sandboxed table, make sure to move all of those questions to admin-only collections. For more info, see [Permissions conflicts: saved SQL questions](#saved-sql-questions).

For a tutorial, check out [Data sandboxing: setting row-level permissions](https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions).

## Prerequisites for advanced data sandboxes

- A [group](../people-and-groups/managing.md#groups) of people to be added to the advanced data sandbox.
- An admin-only [collection](../exploration-and-organization/collections.md) (with [collection permissions](../permissions/collections.md) set to **No access**).
- A [saved SQL question](../people-and-groups/) with the rows and columns to be displayed to the people in the advanced sandbox, stored in the admin-only collection.
- Optional: [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each of the people in the group.

In an advanced data sandbox, a saved question will be displayed in place of an original table to a particular group. Use a saved SQL question to define the exact rows and columns to be included in the sandbox. If you use a query builder (GUI) question, you might accidentally expose more data than you mean to.

To display different filtered versions of the saved question for each person in an advanced data sandbox, set up [user attributes](../people-and-groups/managing.md#adding-user-attributes) as well.

## Creating an advanced sandbox

> Make sure to do the [prerequisites](#prerequisites-for-advanced-data-sandboxes) first.

1. Go to **Admin settings** > **Permissions**.
2. Select the database and table that you want to sandbox.
3. Find the group that you want to put in the sandbox.
4. Click on the dropdown under **Data access** for that group.
5. Select "Sandboxed".
6. Select "Use a saved question to create a custom view for this table".
7. Select your saved question.
8. Optional: [restrict rows based on people's user attributes](#restricting-rows-in-an-advanced-sandbox-with-user-attributes) to the saved question.

If you have existing saved SQL questions that use the sandboxed table, make sure to move all of those questions to admin-only collections. For more info, see [Permissions conflicts: saved SQL questions](#saved-sql-questions).

For an example, see [Advanced data sandboxing: limiting access to columns](https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions).

## Restricting rows in an advanced sandbox with user attributes

If you want an advanced data sandbox to display different rows to each person depending on their [user attributes](../people-and-groups/managing.md#adding-a-user-attribute), such as filtering the Accounts table to `Plan = "Basic"` for one group, and `Plan = "Premium"` for another group:

1. Make sure you've done all the [prerequisites for advanced data sandboxes](#prerequisites-for-advanced-data-sandboxes).
2. Go to the SQL question that will be displayed to the people in the advanced sandbox.
3. Add a [parameterized](../questions/native-editor/sql-parameters.md) `WHERE` clause to your SQL query, such as `{%raw%}[[ WHERE plan = {{ plan_variable }} ]]{%endraw%}`.
4. Save the SQL question.
5. Go to **Admin settings** > **Permissions**.
6. Find the group and table for your advanced sandbox.
7. Open the dropdown under **Data access**.
8. Click **Edit sandboxed access**.
9. Scroll down and set **Parameter or variable** to the name of the parameter in your saved SQL question (such as "Plan Variable").
10. Set the **User attribute** to the **key** of the [user attribute](../people-and-groups/managing.md#adding-a-user-attribute) to be filtered on (such as "User's Plan").
11. Click **Save**.

### How row restriction works in an advanced sandbox

Metabase will apply a different `WHERE` clause to your saved SQL question depending on the **value** of a person's user attribute. Here's how a user attribute gets passed to the `WHERE` clause in your saved SQL question:

A normal `WHERE` clause will filter a column to a fixed value:
```
WHERE column_name = column_value
```

In step 2 of the [row restricting configuration](#restricting-rows-in-an-advanced-sandbox-with-user-attributes) above, you'll add a SQL parameter so that the `WHERE` clause will accept a dynamic value:
```
WHERE plan = {%raw%}{{ plan_variable }}{%endraw%} 
```

In steps 9-10 of the [row restricting configuration](#restricting-rows-in-an-advanced-sandbox-with-user-attributes) above, you're telling Metabase to map the SQL parameter `plan_variable` to a user attribute **key** (for example, a key named "User's Plan"):
```
WHERE plan = USER_ATTRIBUTE_KEY
```

Metabase will use the user attribute key to look up the user attribute **value** for a specific person ("Basic", "Business", or "Premium"):
```
WHERE plan = USER_ATTRIBUTE_VALUE
```

Metabase replaces the SQL parameter with a specific user attribute **value** (such as "Basic") to display the sandboxed table to a specific person:
```
WHERE plan = "Basic"
```

## Required group permissions

Data sandboxes require some specific group permissions to work properly.

- [Native query permissions](../permissions/data.md) will automatically get **disabled** for any groups that will be added to a data sandbox. You cannot sandbox a group that requires native query permissions (access to the SQL editor).
- [Collection permissions](../permissions/collections.md) must be set to **No access** for any collections containing [SQL questions](../questions/native-editor/writing-sql.md) that use sandboxed data (for a given group).

For more info, see [Preventing data sandboxing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

## How sandboxing permissions interact with other permissions

Let's say you set up an [advanced sandbox](#advanced-sandboxes) to hide the Email column from the Accounts table from a group. Here's what you can expect when the sandboxed group tries to interact with something that uses the Accounts table in Metabase:

|                                                                           | Uses sandboxing rules        |
|---------------------------------------------------------------------------|------------------------------|
| [Data browser](#data-browser)                                             | Always                       |
| [Data reference](#data-reference)                                         | Always                       |
| [Public links](#public-links)                                             | Depends on other permissions |
| [Query builder](#query-builder)                                           | Always                       |
| [Saved question (GUI)](#saved-question-gui)                               | Always                       |
| [Saved question (SQL)](#saved-question-sql)                               | Depends on other permissions |
| [Subscriptions or alerts (sending)](#subscriptions-or-alerts-sending)     | Always                       |
| [Subscriptions or alerts (receiving)](#subscriptions-or-alerts-receiving) | Depends on other permissions |
| [SQL editor](#sql-editor)                                                 | Never                        |

### Data browser

Sandboxed groups will be restricted from seeing the Email column and values when selecting the Accounts table from the [data browser](../exploration-and-organization/exploration.md#browse-your-data).

### Data reference

Sandboxed groups will only be able to see a name and description for the Email column (but not the column values) from the [data reference](../exploration-and-organization/data-model-reference.md) for the Accounts table.

### Public links

Sandboxed groups can view the Email column values from a public link, if the creator of the public link is not sandboxed, and the creator has specifically included the Email column in the public link. See [Preventing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

### Query builder

When creating a new question with the Accounts table in the query builder, sandboxed groups will be restricted from seeing the Email column and values.

### Saved question (GUI)

When viewing or editing a saved GUI question that uses the Accounts table, sandboxed groups will be restricted from seeing the Email column and values.

### Saved question (SQL)

Sandboxed groups will be able to see the Email column in a saved SQL question if the SQL query actually includes the Email column, _and_ the SQL question is saved in a collection that the sandboxed group can view or curate.

See [Preventing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

### Subscriptions or alerts (sending)

People in sandboxed groups can view the Email column in a dashboard subscription or alert if:

- The creator of the subscription or alert has permission to see the Email column.
- The subscription or alert actually includes the Email column.

See [Notification permissions](../permissions/notifications.md).

### Subscriptions or alerts (receiving)

People in sandboxed groups can only see and add their own account to a dashboard subscription or alert.

See [Notification permissions](../permissions/notifications.md).

### SQL editor

Groups with permission to use the SQL editor cannot be sandboxed, so they will always be able to see and use the Email column from the Accounts table.

## Preventing data sandboxing permissions conflicts

Some Metabase permissions can conflict with data sandboxing to give more permissive or more restrictive data access than you intended. It's a good idea to review your permissions for each of these scenarios:

- [Multiple data sandboxing permissions](#multiple-data-sandboxing-permissions)
- [Saved SQL questions](#saved-sql-questions)
- [Public sharing](#public-sharing)

### Multiple data sandboxing permissions

Multiple data sandboxes on the same table can create a permissions conflict. You can add a person to a maximum of one data sandbox per table (via the person's group membership).

For example, if you have:

- One data sandbox for the group "Basic Accounts" that filters the Accounts table on `Plan = "Basic"`.
- Another data sandbox for the group "Converted Accounts" that filters the Accounts table on `Trial Converted = true`.

If you put Vincent Accountman in both groups, he'll get conflicting data sandboxes on the Accounts table, and get an error message whenever he tries to use Accounts in Metabase.

To resolve data sandboxing conflicts for a person in multiple groups:

- Remove the person from all but one of the groups.
- Remove all but one of the data sandboxes for that table (change the table's data access to **No self-service**).

### Saved SQL questions

Data sandboxing permissions don't apply to the results of SQL questions.

Say that you have a data sandbox for the Accounts table that excludes the Email column. If someone makes a SQL question using the Accounts table and includes the Email column, **anyone with collection permissions to view that SQL question** will be able to:

- See the Email column in the SQL question results.
- Use the SQL question to start a new question that includes the Email column.

To prevent people in a data sandbox from viewing the original (non-sandboxed) Accounts data via a SQL question:

- Put any SQL questions using the Accounts table in a separate collection.
- Set the [collection permissions](../permissions/collections.md) to **No access** for groups who should only see sandboxed versions of the Accounts table.

Metabase doesn't know what tables are included in a SQL query, so SQL questions will always display results from the original (non-sandboxed) version of a table. Collection permissions can be used prevent sandboxed groups from viewing those SQL questions. That's why, when you create an advanced sandbox, you have to put the saved SQL question (the one you want to display in the sandbox) in an admin-only collection.

### Public sharing

Data sandboxing permissions don't apply to public questions or public dashboards. If someone creates a public link using data from a sandboxed table, the public link may display non-sandboxed data (depending on the question or dashboard in the link).

To prevent this from happening, you'll have to [disable public sharing](../questions/sharing/public-links.md) for your Metabase instance.

Metabase can only create a data sandbox using the group membership or user attributes of people who are logged in. Since public links don’t require logins, Metabase won’t have enough info to create the sandbox.

## Further reading

- [Permissions strategies](https://www.metabase.com/learn/permissions/strategy)
- [Configuring permissions for different customer schemas](https://www.metabase.com/learn/permissions/multi-tenant-permissions)
- [Securing embedded Metabase](https://www.metabase.com/learn/customer-facing-analytics/securing-embeds)
