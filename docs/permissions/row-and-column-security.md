---
title: Row and column security
summary: Control what data different groups can see by filtering rows and columns based on user attributes. Useful for multi-tenant analytics.
redirect_from:
  - /docs/latest/enterprise-guide/data-sandboxes
  - /docs/latest/permissions/data-sandboxes
---

# Row and column security

{% include plans-blockquote.html feature="Row and column security" %}

Row and column security lets you give granular permissions for different groups of people. You can change what data a group [can view](./data.md#can-view-data-permission), as well as what data a group [can query](./data.md#create-queries-permissions) with the query builder.

You can use row and column security to set up [self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics), so that each of your customers can only view the rows that match their customer ID. For example, if you have an Accounts table with information about your customers, you can add permissions to the table so that each customer only sees the data relevant to them.

> Row and column security was formerly called data sandboxing. It's the same feature, it just now has a more descriptive name.

## Row and column security examples

You can skip the theory and go [straight to examples of row and column security](row-and-column-security-examples.md).

## How row and column security works

You can think of row and column security as a bundle of permissions that includes:

- The filtered version of a table that will replace your original table, everywhere that the original table is used in Metabase.
- The [group](../people-and-groups/managing.md#groups) of people who should see the filtered version of the table.

You can define up to one row and column security policy for each table/group combo in your Metabase. This means you can display different versions of a table for different groups, such as "Accounts for Sales" to your salespeople, and "Accounts for Managers" for sales managers.

## Types of row and column security

Row and column security show specific data to each person based on their [user attributes](../people-and-groups/managing.md#adding-a-user-attribute). You can:

- [Restrict **rows**](#row-level-security-filter-by-a-column-in-the-table)
- [Restrict **columns** and rows](#custom-row-and-column-security-use-a-sql-question-to-create-a-custom-view-of-a-table) for specific people.

| Goal                                           | Row (filter by a column in the table) | Custom (use a saved SQL question) |
| ---------------------------------------------- | ------------------------------------- | --------------------------------- |
| Restrict rows by filtering on a single column  | ✅                                    | ✅                                |
| Restrict rows by filtering on multiple columns | ❌                                    | ✅                                |
| Restrict columns                               | ❌                                    | ✅                                |
| Edit columns                                   | ❌                                    | ✅                                |

### Row-level security: filter by a column in the table

You can **restrict rows** by filtering a column using a [user attribute value](#choosing-user-attributes-for-row-and-column-security).

For example, you can filter the Accounts table for a group so that the user attribute filters the table:

- "Basic" will see rows where `Plan = "Basic"` (rows where the Plan column matches the value "Basic").
- "Premium" will see the rows where `Plan = "Premium"` (rows where the Plan column matches the value "Premium").

### Custom row and column security: use a SQL question to create a custom "view" of a table

To **restrict rows _and_ columns**, you can use a SQL question to filter the table. When someone views that table, they'll instead see the question's results, not the raw table.

For example, say your original Accounts table includes the columns: `ID`, `Email`, `Plan`, and `Created At`. If you want to hide the Email column, you can create a "Restricted Accounts" SQL question with the columns: `ID`, `Plan`, and `Created At`.

You can use a question to:

- [Display an edited column instead of hiding the column](#displaying-edited-columns).
- [Pass a user attribute to a SQL parameter](#restricting-rows-with-user-attributes-using-a-sql-variable).

## Prerequisites for row security

- A [group](../people-and-groups/managing.md#groups) of people to add row security.
- [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each person in the group.

Row security displays a filtered table, in place of an original table, to a specific group. How Metabase filters that table depends on the value in each person's user attribute.

For example, you can set up a row-level security so that the user attribute `plan` shows different rows for different values:

- "Basic" will see a version of the Accounts table with a filter for `Plan = "Basic"` (that is, only the rows where the Plan column matches the value "Basic").
- "Premium" will see a different version of the Accounts table with the filter `Plan = "Premium"` applied.

## Choosing user attributes for row and column security

**User attributes are required for row security, and optional for column security**. When [adding a new user attribute](../people-and-groups/managing.md#adding-a-user-attribute), you'll set up a key-value pair for each person.

Metabase uses the user attribute key to look up the user attribute value for a specific person. User attribute keys can be mapped to parameters in Metabase.

The **user attribute value** must be an exact, case-sensitive match for the filter value. For example, if you add row security to the Accounts table with the filter `Plan = "Basic"`, make sure that you enter "Basic" as the user attribute value. If you set the user attribute value to lowercase "basic" (a value which doesn't exist in the Plan column of the Accounts table), the person will get an empty result instead of the table.

Examples of user attributes in play:

- [Row security](./row-and-column-security-examples.md#filtering-rows-based-on-user-attributes)
- [Restricting rows and columns](./row-and-column-security-examples.md#custom-example-2-filtering-rows-and-columns)

## Adding row-level security

1. Make sure to do the [prerequisites for row security](#prerequisites-for-row-security) first.
2. Go to **Admin settings** > **Permissions**.
3. Select the database and table that you want to secure.
4. Find the group that you want to put in the secure.
5. Click on the dropdown under **View data** for that group.
6. Select "Row and column security".
7. Click the dropdown under **Column** and enter the column to filter the table on, such as "Plan".
8. Click the dropdown under **User attribute** and enter the user attribute **key**, such as "Plan".

> If you have SQL questions that query data with row-level security, make sure to move all of those questions to admin-only collections. For more info, see [You cannot secure the rows or columns of SQL results](#you-cannot-secure-the-rows-or-columns-of-sql-results).

Check out [row and column security examples](./row-and-column-security-examples.md).

## Prerequisites for column-level security

- A [group](../people-and-groups/managing.md#groups) of people.
- An admin-only [collection](../exploration-and-organization/collections.md), with [collection permissions](../permissions/collections.md) set to **No access** for all groups except Administrators.
- A [SQL question](../questions/native-editor/writing-sql.md) with the rows and columns to be displayed to the people in the group, stored in the admin-only collection.
- Optional: if you want to restrict **rows** as well, set up [user attributes](#choosing-user-attributes-for-row-and-column-security) for each of the people in the group.

### Creating a SQL question for Metabase to display instead of a table

Metabase will display the results of the question in place of an original table to a particular group.

**Use a SQL question** to define the exact rows and columns to be included in the custom view. Avoid using a query builder (GUI) question, as you might accidentally expose extra data, since GUI questions can include data from other questions or models.

> Make sure to save the SQL question in an admin-only collection ([collection permissions](../permissions/collections.md) set to **No access** for all groups except Administrators). For more info, see [You cannot secure the rows or columns of SQL results](#you-cannot-secure-the-rows-or-columns-of-sql-results).

### Displaying edited columns

Aside from excluding rows and columns, you can also **display edited columns** (without changing the columns in your database).

For example, you can create a "Edited Accounts" SQL question that truncates the Email column to display usernames instead of complete email addresses.

If you edit a column, the schema of the SQL question (the question you want to display instead of the table) must match the schema of the original table. That means the "Edited Accounts" SQL question must return the same number of columns and corresponding data types as the original Accounts table.

You cannot add columns.

## Setting up column security

1. Make sure to do the [prerequisites](#prerequisites-for-column-level-security) first.
2. Go to **Admin settings** > **Permissions**.
3. Select the database and table that you want to secure.
4. Find the group to restrict.
5. Click on the dropdown under **Data access** for that group.
6. Select "Row and column security".
7. Select "Use a saved question to create a custom view for this table".
8. Select your saved question. The question should be written in SQL. If the question contains parameters, those parameters must be required (they cannot be optional).
9. Optional: [restrict rows based on people's user attributes](#restricting-rows-with-user-attributes-using-a-sql-variable).

You can find sample setups in the [Row and column security examples](./row-and-column-security-examples.md).

### Restricting rows with user attributes using a SQL variable

If you set up column security, you can also restrict different rows for each person depending on their [user attributes](../people-and-groups/managing.md#adding-a-user-attribute). For example, you can display the "Accounts" question with the filter `Plan = "Basic"` for one group, and the filter `Plan = "Premium"` for another group.

1. Make sure you've done all the [prerequisites for column-level security](#prerequisites-for-column-level-security).
2. Go to the SQL question that will be displayed to the people in place of the table.
3. Add a [parameterized](../questions/native-editor/sql-parameters.md) `WHERE` clause to your SQL query, such as `{%raw%}WHERE plan = {{ plan_variable }} {%endraw%}`.
4. Save the SQL question.
5. Go to **Admin settings** > **Permissions**.
6. Find the group and table you want to secure.
7. Open the dropdown under **View data**.
8. Click **Edit row and column security**.
9. Scroll down and set **Parameter or variable** to the name of the parameter in your SQL question (such as "Plan Variable").
10. Set the **User attribute** to a [user attribute key](#choosing-user-attributes-for-row-and-column-security) (such as the key "User's Plan", _not_ the value "Basic").
11. Click **Save**.

For a sample SQL variable and user attribute setup, see the [Row and column security examples](./row-and-column-security-examples.md).

### How row restriction works with column security

A standard `WHERE` clause filters a table by setting a column to a fixed value:

```sql
WHERE column_name = column_value
```

In step 2 of the [row restriction setup](#restricting-rows-with-user-attributes-using-a-sql-variable) above, you'll add a SQL variable so that the `WHERE` clause will accept a dynamic value. The [SQL variable type](../questions/native-editor/sql-parameters.md#sql-variable-types) must be text, number, or date:

```sql
WHERE plan = {%raw%}{{ plan_variable }}{%endraw%}
```

In steps 9-10 of the [row restriction setup](#restricting-rows-with-user-attributes-using-a-sql-variable) above, you're telling Metabase to map the SQL variable `plan_variable` to a **user attribute key** (such as "User's Plan"). Metabase will use the key to look up the specific **user attribute value** (such as "Basic") associated with a person's Metabase account. When that person logs into Metabase and uses the secured table, they'll see the query result that is filtered on:

```sql
WHERE plan = "Basic"
```

Note that the parameters must be required for SQL questions used to create custom views. For example, you can't use an optional parameter; the following won't work:

```sql
{%raw%}
[[WHERE plan = {{ plan_variable }}]]
{%endraw%}
```

Learn more about [SQL parameters](../questions/native-editor/sql-parameters.md)

### Advanced row-level security: filtering tables for people that have multiple IDs

For example, say have a table like this:

| User_ID | Value |
|---------|-------|
| 1       | 10    |
| 1       | 50    |
| 2       | 5     |
| 2       | 50    |
| 3       | 5     |
| 3       | 5     |

If you want to give someone access to multiple user IDs (e.g., the person should see rows for both `User_ID` 1 and 2.), you can set up a user attribute, like `user_id` that can handle comma-separated values like "1,2".

1. Create a SQL question that parses the comma-separated string and filters the table:

```sql
{%raw%}
SELECT *
FROM users_with_values
WHERE user_id = ANY(STRING_TO_ARRAY(REGEXP_REPLACE(TRIM({{user_id}}), '\\s*,\\s*', ','), ','))
{% endraw %}
```

This query:

- Trims whitespace from the user attribute value
- Replaces any spaces around commas with just commas
- Converts the comma-separated string to an array
- Filters rows where the user_id matches any value in the array

The `STRING_TO_ARRAY()` and `REGEXP_REPLACE()` functions are PostgreSQL-specific. To see which functions your database supports, see your database's documentation.

3. Set up the row and column security using this SQL question. See [setting up column security](#setting-up-column-security).

## Preventing row and column security permissions conflicts

Some Metabase permissions can conflict with row and column security to give more permissive or more restrictive data access than you intended.

Say you've set up [column security](#custom-row-and-column-security-use-a-sql-question-to-create-a-custom-view-of-a-table) that hides the Email column from the Accounts table (for a particular group).

The Email column may get exposed to someone if:

- The person belongs to [multiple row and column security policies](#multiple-row-and-column-security-permissions).
- Someone else in a non-secured group shares the Email column from:
  - A [SQL question](../questions/native-editor/writing-sql.md)
  - A [public link](#public-sharing)
  - An [alert, or dashboard subscription](../permissions/notifications.md)

### Multiple row and column security permissions

Multiple row and column security policies on the same table can create a permissions conflict. You can add a person to a maximum of one row and column security policy per table (via the person's group).

For example, if you have:

- Set up security for the group "Basic Accounts" that filters the Accounts table on `Plan = "Basic"`.
- Another setup for the group "Converted Accounts" that filters the Accounts table on `Trial Converted = true`.

If you put Vincent Accountman in both groups, he'll have conflicting permissions for the Accounts table, and get an error message whenever he tries to use Accounts in Metabase.

To resolve row and column security permissions conflicts:

- Remove the person from all but one of the groups.
- Set the all but one of the group's [View data](./data.md#view-data-permissions) access to the datatabase to "Blocked".

### You cannot secure the rows or columns of SQL results

Row and column security permissions don't apply to the results of SQL questions. That is, SQL questions will always display results from the original table rather than the secured table.

Say that you've set up column security on the Accounts table to hide the Email column. If someone creates a SQL question that includes the Email column, **anyone with collection permissions to view that SQL question** will be able to:

- See the Email column in the SQL question results.
- Use the SQL question to start a new question that includes the Email column (if they have query permissions).

To prevent the Email column from being exposed via a SQL question:

- Put any SQL questions that include the Email column in a separate collection.
- Set the [collection permissions](../permissions/collections.md) to **No access** for groups with row and column security set up to hide the Email column.

[Collection permissions](../permissions/collections.md) must be used to prevent secured groups from viewing SQL questions that reference secured tables.

### Public sharing

Row and column security permissions don't apply to public questions or public dashboards. If someone in an unsecured group creates a public link using an original table, the original table will be displayed to anyone who has the public link URL.

To prevent this from happening, you'll have to [disable public sharing](../embedding/public-links.md) for your Metabase.

Metabase can only create row and column security using the group membership or user attributes of people who are logged in. Since public links don't require logins, Metabase won't have enough info to apply permissions.

## Limitations of row and column security

Some things to keep in mind when using row and column security.

### Groups with native query permissions (access to the SQL editor) can bypass row and column security

Row and column security is limited to the [query builder](../questions/query-builder/editor.md).
You can't set up [native query persmissons](./data.md#create-queries-permissions) for groups with row and column security.

To enforce row-level permissions with the native query editor, check out [impersonation](./impersonation.md).

### You can't apply row and column security to SQL questions

Since Metabase can't parse SQL queries, the results of SQL questions will always use original tables.

[Use collection permissions](#you-cannot-secure-the-rows-or-columns-of-sql-results) to prevent groups from viewing saved SQL questions with restricted data.

### Non-SQL databases have limited row and column security

MongoDB only supports [row-level security](#row-level-security-filter-by-a-column-in-the-table). Row and column security permissions are unavailable for Apache Druid.

### Advanced data types require a workaround

If you're trying to set up row security on a column with an advanced data type (like enums or arrays), you'll need to convert that data to a basic type first. Options include:

#### Option 1: Use SQL to cast the advanced data type to a basic SQL type

Create a SQL question that casts the advanced data type column to a basic data type, then use that question for your row and column security setup.

#### Option 2: Create a database view

If you can't use SQL casting in Metabase, create a view in your database that converts the advanced data type to a basic type, then set up row and column security on that view instead of the original table. You'll also need to block the original table.

#### Option 3: Use transforms

 Use a [transform](../data-modeling/transforms.md) to create a table that casts the advanced data type to a basic type. Then set up row and column security on the transformed table instead. You'll also need to block the original table.

### People with row and column security can't create Slack subscriptions or alerts

People in groups with row and column security can't create Slack [alerts](../questions/alerts.md) or [dashboard subscriptions](../dashboards/subscriptions.md). Email alerts and subscriptions are still available. See [Notification permissions](./notifications.md).

## Further reading

- [Row and column security examples](./row-and-column-security-examples.md)
- [Permissions strategies](https://www.metabase.com/learn/metabase-basics/administration/permissions/strategy)
- [Configuring permissions for embedding](../permissions/embedding.md)
- [Securing embedded Metabase](../embedding/securing-embeds.md)
