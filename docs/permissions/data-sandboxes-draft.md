---
title: Data sandboxes
---

# Data sandboxes

{% include plans-blockquote.html feature="Data sandboxes" %}

Data sandboxes let you give granular permissions to rows and columns for different groups of people.

Say you have people who you want to be able to log into your Metabase, but who should only be able to view data that pertains to them. For example, you might want to display an Accounts table to some customers, but each customer should only be able to view the rows that match their customer ID. Sandboxes let you give people a way to [self-serve their own analytics](https://www.metabase.com/learn/customer-facing-analytics/multi-tenant-self-service-analytics), without ever seeing any results that don't pertain to them.

## How sandboxes work

Data sandboxes work by displaying an edited version of a table, instead of the original table, to a specific group.

You can think of a data sandbox as a bundle of permissions that includes:

- The edited version of a table that will replace the original table, everywhere that the original table is used in Metabase.
- The [group](../people-and-groups/managing.md#groups) of people who should see the edited version of the table.

You can define up to one data sandbox for each table/group combo in your Metabase. That means you can display different versions of a table for different groups, such as "Sandboxed Accounts for A" to Customer A, and "Sandboxed Accounts for B" to Customer B.

## Types of data sandboxes

A [row-restricted sandbox](#row-restricted-sandboxes-filter-by-a-column-in-the-table-based-on-user-attributes) will display a filtered table in place of the original table (to a specific group).

A [custom sandbox](#custom-sandboxes-use-a-saved-question-to-create-a-custom-view-for-this-table) will display a custom query result in place of the original table (to a specific group).

### Row-restricted sandboxes: filter by a column in the table based on user attributes

A row-restricted sandbox displays the result of a table filtered by a [user attribute](../people-and-groups/managing.md#adding-user-attributes).

A group assigned to a row-restricted sandbox will see a table with some `Filter = "User Attribute"` applied.

For example, you can create a row-restricted sandbox to filter an Accounts table for a sandboxed group so that:
- A sandboxed person with the user attribute "Basic" will see the rows where `Plan = "Basic"`.
- A sandboxed person with the user attribute "Premium" will only see the rows where `Plan = "Premium"`.

For more info, see [Choosing user attributes for sandboxing](#choosing-user-attributes-for-sandboxing).

### Custom sandboxes: use a saved question to create a custom view for this table

To **restrict the columns** of a table (in addition to row-restriction), you'll have to use an custom sandbox. An custom sandbox displays the results of a saved SQL question in place of an original table.

For example, say your original Accounts table includes the columns: ID, Email, Plan, and Created At. 

To hide the Email column, you'll create a "Sandboxed Accounts" SQL question with the columns: ID, Plan, and Created At.

Then, set up an custom sandbox to display "Sandboxed Accounts" instead of the original Accounts table, to a specific group. Groups in the custom sandbox will see the "Sandboxed Accounts" question result instead of the original Accounts table, everywhere that Accounts is used in Metabase.

For more info, see [Creating a SQL question for Metabase to display in a custom sandbox](#creating-a-sql-question-for-metabase-to-display-in-an-custom-sandbox).

## Limitations

Things that don't play well in a sandbox.

### Groups with native query permissions (access to the SQL editor) cannot be sandboxed

People with SQL editor access to a database will always be able to query any original table from that database. This is because Metabase cannot parse a SQL query to identify the tables in that query. 

[Native query permissions](../permissions/data.md) will automatically get **disabled** for any groups that will be added to a data sandbox. If you need to prevent people with SQL access from querying specific tables in a database, you can edit your [database users, roles, and privileges](../databases/users-roles-privileges.md).

### SQL questions cannot be sandboxed

Since Metabase cannot parse SQL queries, the results of saved SQL questions will always use original tables, not sandboxed tables. Use [collection permissions](../permissions/collections.md) to prevent sandboxed groups from viewing saved SQL questions with restricted data. See [Permissions conflicts: saved SQL questions](#saved-sql-questions).

### Non-SQL databases cannot be sandboxed

Data sandboxing is unavailable for non-SQL databases such as Apache Druid or MongoDB.

## Prerequisites for row-restricted sandboxes

- A [group](../people-and-groups/managing.md#groups) of people to be added to the row-restricted data sandbox.
- [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each person in the group.

A row-restricted sandbox displays a filtered table in place of an original table to a specific group. The filter on the table will be specific to each person in the group, depending on the value of their user attribute.

For example, you can [set things up](#choosing-user-attributes-for-sandboxing) so that:

- Someone with the **user attribute value** "Basic" sees a sandboxed Accounts table filtered on the column `Plan = "Basic"`.
- Someone with the **user attribute value** "Premium" sees a sandboxed Accounts table filtered on the column `Plan = "Premium"`.

### Choosing user attributes for sandboxing

When [adding a new user attribute](../people-and-groups/managing.md#adding-a-user-attribute), you'll set up a key-value pair for each person.

The **user attribute key** is used to look up the **user attribute value** for a specific person. User attribute keys can be mapped to parameters in Metabase, such as [SQL parameters](../questions/native-editor/sql-parameters.md). For an example, see [How row restriction works in an custom sandbox](#how-row-restriction-works-in-an-custom-sandbox).

The **user attribute value** must be an exact, case-sensitive match for the filter value of a sandboxed table. For example, if you're creating a [row-restricted sandbox](#row-restricted-sandboxes-filter-by-a-column-in-the-table-based-on-user-attributes) on the Accounts table with the filter `Plan = "Basic"`, make sure that you enter "Basic" as the user attribute value. If you set the user attribute value to lowercase "basic" (a value which doesn't exist in the Plan column of the Accounts table), the sandboxed person will get an empty result instead of the sandboxed table.

## Creating a row-restricted sandbox

1. Make sure to do the [prerequisites for row-restricted sandboxes](#prerequisites-for-row-restricted-sandboxes) first.
2. Go to **Admin settings** > **Permissions**.
3. Select the database and table that you want to sandbox.
4. Find the group that you want to put in the sandbox.
5. Click on the dropdown under **Data access** for that group.
6. Select "Sandboxed".
7. Click the dropdown under **Column** and enter the filter name for your table, such as "Plan".
8. Click the dropdown under **User attribute** and enter the user attribute **key**, such as "User's Plan".

> If you have saved SQL questions that use sandboxed data, make sure to move all of those questions to admin-only collections. For more info, see [Permissions conflicts: saved SQL questions](#saved-sql-questions).

For a tutorial, check out [Data sandboxing: setting row-level permissions](https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions).

## Prerequisites for custom sandboxes

- A [group](../people-and-groups/managing.md#groups) of people to be added to the advanced data sandbox.
- An admin-only [collection](../exploration-and-organization/collections.md) ([collection permissions](../permissions/collections.md) set to **No access** for all groups except Administrators).
- A [saved SQL question](../people-and-groups/) with the rows and columns to be displayed to the people in the custom sandbox, stored in the admin-only collection.
- Optional: [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each of the people in the group.

To display different filtered versions of the saved question for each person in an advanced data sandbox, set up [user attributes](../people-and-groups/managing.md#adding-user-attributes) as well.

### Creating a SQL question for Metabase to display in an custom sandbox

In an advanced data sandbox, Metabase will display a saved question in place of an original table to a particular group. 

**Use a SQL question** to define the exact rows and columns to be included in the sandbox. If you use a query builder (GUI) question, you might accidentally expose extra data, since GUI questions can include data from other saved questions or models.

> Make sure to save the SQL question in an admin-only collection ([collection permissions](../permissions/collections.md) set to **No access** for all groups except Administrators). For more info, see [Permissions conflicts: saved SQL questions](#saved-sql-questions).

### Displaying edited columns in an custom sandbox

Aside from excluding rows and columns from an custom sandbox, you can also **display edited columns** (without changing the columns in your database). 

For example, you can create a "Sandboxed Accounts" SQL question that truncates the Email column to display usernames instead of complete email addresses.

If you edit a column, the schema of the saved SQL question (the question you want to display in the sandbox) must match the schema of the original table. That means the "Sandboxed Accounts" SQL question must return the same number of columns and corresponding data types as the original Accounts table.

You cannot add a column to an custom sandbox.

## Creating a custom sandbox

1. Make sure to do the [prerequisites for custom sandboxes](#prerequisites-for-custom-sandboxes) first.
2. Go to **Admin settings** > **Permissions**.
3. Select the database and table that you want to sandbox.
4. Find the group that you want to put in the sandbox.
5. Click on the dropdown under **Data access** for that group.
6. Select "Sandboxed".
7. Select "Use a saved question to create a custom view for this table".
8. Select your saved question.
9. Optional: [restrict rows based on people's user attributes](#restricting-rows-in-an-custom-sandbox-with-user-attributes) to the saved question.

> If you have saved SQL questions that use sandboxed data, make sure to move all of those questions to admin-only collections. For more info, see [Permissions conflicts: saved SQL questions](#saved-sql-questions).

For an example, see [Data sandboxing: limiting access to columns](https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions).

## Restricting rows in an custom sandbox with user attributes

You can set up an custom sandbox to display different rows to each person depending on their [user attributes](../people-and-groups/managing.md#adding-a-user-attribute). For example, you can display the "Sandboxed Accounts" question with the filter `Plan = "Basic"` for one group, and the filter `Plan = "Premium"` for another group.

1. Make sure you've done all the [prerequisites for custom sandboxes](#prerequisites-for-custom-sandboxes).
2. Go to the SQL question that will be displayed to the people in the custom sandbox.
3. Add a [parameterized](../questions/native-editor/sql-parameters.md) `WHERE` clause to your SQL query, such as `{%raw%}[[ WHERE plan = {{ plan_variable }} ]]{%endraw%}`.
4. Save the SQL question.
5. Go to **Admin settings** > **Permissions**.
6. Find the group and table for your custom sandbox.
7. Open the dropdown under **Data access**.
8. Click **Edit sandboxed access**.
9. Scroll down and set **Parameter or variable** to the name of the parameter in your saved SQL question (such as "Plan Variable").
10. Set the **User attribute** to the **key** of the [user attribute](../people-and-groups/managing.md#adding-a-user-attribute) to be filtered on (such as "User's Plan").
11. Click **Save**.

### How row restriction works in an custom sandbox

How user attributes, SQL parameters, and custom sandboxes work together to display different rows to different people.

A standard `WHERE` clause filters a table by setting a column to a fixed value:
```
WHERE column_name = column_value
```

In step 2 of the [row restricting configuration](#restricting-rows-in-an-custom-sandbox-with-user-attributes) above, you'll add a SQL variable so that the `WHERE` clause will accept a dynamic value. The [SQL variable type](../questions/native-editor/sql-parameters.md#sql-variable-types) must be text, number, or date.
```
WHERE plan = {%raw%}{{ plan_variable }}{%endraw%} 
```

In steps 9-10 of the [row restricting configuration](#restricting-rows-in-an-custom-sandbox-with-user-attributes) above, you're telling Metabase to map the SQL variable `plan_variable` to a **user attribute key** (such as "User's Plan"):
```
WHERE plan = USER_ATTRIBUTE_KEY
```

Metabase will use the key to look up the **user attribute value** (for example, the "User's Plan" key can map to the values "Basic", "Business", or "Premium"):
```
WHERE plan = USER_ATTRIBUTE_VALUE
```

Metabase replaces the SQL parameter with the specific **user attribute value** (such as "Basic") associated with a sandboxed person. When that person logs into Metabase and uses the sandboxed table, they'll see the query result that uses:
```
WHERE plan = "Basic"
```

## How sandboxing permissions interact with other permissions

Let's say you set up an [custom sandbox](#custom-sandboxes-use-a-saved-question-to-create-a-custom-view-for-this-table) to hide the Email column from the Accounts table (for a particular group). Here's what you can expect when the sandboxed group tries to interact with something that uses the Accounts table in Metabase:

|                                    | Uses sandboxing rules (hides the Email column)                  |
|------------------------------------|-----------------------------------------------------------------|
| Data browser                       | Always                                                          |
| Data reference                     | Always                                                          |
| Public links                       | [Depends on other permissions](#public-sharing)                 |
| Query builder                      | Always                                                          |
| Saved question (GUI)               | Always                                                          |
| Saved question (SQL)               | [Depends on other permissions](#saved-sql-questions)            |
| Subscriptions or alerts (sending)  | [Depends on other permissions](../permissions/notifications.md) |
| Subscriptions or alerts (receiving | Always                                                          |
| SQL editor                         | [Never](#limitations)                                           |

## Preventing data sandboxing permissions conflicts

Some Metabase permissions can conflict with data sandboxing to give more permissive or more restrictive data access than you intended. 

Say you have an [custom sandbox](#custom-sandboxes-use-a-saved-question-to-create-a-custom-view-for-this-table) that hides the Email column from the Accounts table (for a particular group). The Email column may be exposed to a sandboxed person if:

- That sandboxed person belongs to [multiple data sandboxes](#multiple-data-sandboxing-permissions).
- A non-sandboxed person creates a [saved SQL question](#saved-sql-questions) that includes the Email column.
- A non-sandboxed person creates a [public link](#public-sharing) that includes the Email column.

### Multiple data sandboxing permissions

Multiple data sandboxes on the same table can create a permissions conflict. You can add a person to a maximum of one data sandbox per table (via the person's group membership).

For example, if you have:

- One data sandbox for the group "Basic Accounts" that filters the Accounts table on `Plan = "Basic"`.
- Another data sandbox for the group "Converted Accounts" that filters the Accounts table on `Trial Converted = true`.

If you put Vincent Accountman in both groups, he'll be in conflicting sandboxes for the Accounts table, and get an error message whenever he tries to use Accounts in Metabase.

To resolve data sandboxing conflicts for a person in multiple groups:

- Remove the person from all but one of the groups.
- Remove all but one of the data sandboxes for that table (change the table's data access to **No self-service**).

### Saved SQL questions

Data sandboxing permissions don't apply to the results of SQL questions. Saved SQL questions will always display results from the original table rather than the sandboxed table, because Metabase cannot parse a SQL query to identify the tables in that query.

Say that you have an custom sandbox that hides the Email column from the Accounts table:

If a person with native query permissions creates a SQL question that includes the Email column, **anyone with collection permissions to view that SQL question** will be able to:

- See the Email column in the SQL question results.
- Use the SQL question to start a new question that includes the Email column.

To prevent sandboxed groups from gaining access to the Email column via a SQL question:

- Put any SQL questions that include the Email column in a separate collection.
- Set the [collection permissions](../permissions/collections.md) to **No access** for sandboxed groups that should not see the Email column.

[Collection permissions](../permissions/collections.md) must be used to prevent sandboxed groups from viewing saved SQL questions that reference sandboxed tables. That's why, when you create an custom sandbox, you have to put the saved SQL question (the one you want to display in the sandbox) in an admin-only collection.

### Public sharing

Data sandboxing permissions don't apply to public questions or public dashboards. 

If someone creates a public link using data from a sandboxed table, the public link may display non-sandboxed data (depending on the question or dashboard in the link).

To prevent this from happening, you'll have to [disable public sharing](../questions/sharing/public-links.md) for your Metabase instance.

Metabase can only create a data sandbox using the group membership or user attributes of people who are logged in. Since public links don’t require logins, Metabase won’t have enough info to create the sandbox.

## Further reading

- [Permissions strategies](https://www.metabase.com/learn/permissions/strategy)
- [Configuring permissions for different customer schemas](https://www.metabase.com/learn/permissions/multi-tenant-permissions)
- [Securing embedded Metabase](https://www.metabase.com/learn/customer-facing-analytics/securing-embeds)
