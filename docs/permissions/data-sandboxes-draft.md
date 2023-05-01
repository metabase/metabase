---
title: Data sandboxes
---

# Data sandboxes

{% include plans-blockquote.html feature="Data sandboxes" %}

Data sandboxes let you give granular permissions to rows and columns for different groups of people.

You can think of a data sandbox as a permissions "container" that includes:

- The edited version of a table in your database (for example, with some rows or columns removed).
- The [group](../people-and-groups/managing.md#groups) of people who should see the edited version of the table instead of the original table, everywhere that the table is used in Metabase.\*

You can define one data sandbox (that is, one permission set) for each table and group pairing in your Metabase.

## Types of data sandboxes

For each group and table pairing, you can choose between:

- A [row-limiting data sandbox](#row-limiting-data-sandboxes), to hide rows from a table based on a user attribute.
- An [advanced data sandbox](#advanced-data-sandboxes), to display a custom query result in place of a table (the attribute-based filter is optional).

### Row-limiting data sandboxes

A row-limiting sandbox displays the result of a filtered table. Groups assigned to a row-limiting sandbox will see a version of the table with some `Filter = Value` applied, instead of the original table.

For example, you can create a row-limiting sandbox to filter the Accounts table so that one person sees the rows where `Plan = Basic`, and another person only sees the rows where `Plan = Premium`. 

A data sandbox will dynamically set the filter value to "Basic" or "Premium" to hide different rows for each person based on their [user attributes](../people-and-groups/managing.md#adding-user-attributes).

### Advanced data sandboxes

An advanced sandbox displays the results of a saved question in place of a table, anywhere that table is used in Metabase. This type of sandbox must be used if you want to **restrict the columns** in a table.

Say you create a saved question called "Sandboxed Accounts" that excludes the Email column from the Accounts table. An advanced sandbox will display the "Sandboxed Accounts" question to a group in place of the original Accounts table, across all of the questions, dashboards, and models that use the Accounts table in Metabase.\*

Advanced sandboxes can also be set up to display custom datasets with joined data, filters, custom columns, aggregations, and so on.

\* SQL questions are the exception. See [Preventing data sandboxing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

## Prerequisites for row-limiting data sandboxes

- A [group](../people-and-groups/managing.md#groups) of people to be added to the row-limiting data sandbox.
- [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each person in the group.

In a row-limiting data sandbox, a filtered table will be displayed in place of an original table to a specific group. The user attributes from a group are used to set that filter.

When adding a user attribute for sandboxing, make sure that the **value** of the user attribute is an exact, case-sensitive match for the values in the column used to filter the table.

## Creating a row-limiting data sandbox

> Make sure to do the [prerequisites](#prerequisites) first.

1. Go to **Admin settings** > **Permissions**.
2. Select the database and table that you want to sandbox.
3. Find the group that you want to put in the sandbox.
4. Disable **Native query editing** for the group.
5. Click on the dropdown under **Data access** for that group.
6. Select "Sandboxed".
7. Click the dropdown under **Column** and enter the filter name for your table.
8. Click the dropdown under **User attribute** and enter the user attribute **key**.
9. Go to **Collections** and set the permissions to **View** for any collections containing SQL questions that use the sandboxed data.

### Example of a row-limiting data sandbox

To manually sandbox the Accounts table so that each person who logs into Metabase only sees the rows from Accounts that match their plan:

1. Go to **Admin settings** > **People**.
2. Add or find a person.
3. Add a user attribute with a key named "Plan".
4. Set the user attribute value to "Basic", "Business", or "Premium".
5. Create a group called "Sandboxed People".
6. Add the person to the "Sandboxed People" group.
7. Go to **Admin settings** > **Permissions**.
8. Select **Sample Database** > **Accounts**.
9. Click on the dropdown under **Data access** for the "Basic" group.
10. Select "Sandboxed".
11. Click the dropdown under **Column** and enter "Plan".
12. Click the dropdown under **User attribute** and enter "Plan".

Now, everyone in the "Sandboxed People" group will see a filtered version of the Accounts table in Metabase, instead of the original Accounts table. The filtered table contain rows where `Plan = Basic` for people with the user attribute `Plan = Basic`, `Plan = Business` for people with the user attribute `Plan = Business`, and so on.

## Prerequisites for advanced data sandboxes

- A [group](../people-and-groups/managing.md#groups) of people to be added to the advanced data sandbox.
- A private [collection](../exploration-and-organization/collections.md) (with[collection permissions](../permissions/collections.md) set to **No access**) to store your saved SQL questions.
- A [SQL question](../people-and-groups/) with the rows and columns to be displayed to the people in the advanced sandbox, and saved in the private collection.
- Optional: [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) for each of the people in the group.

In an advanced data sandbox, a saved question will be displayed in place of an original table to a particular group. We recommend using saved SQL questions for the best control over the rows and columns to be included in the sandbox.

To display different filtered versions of the saved question for each person in an advanced data sandbox, set up [user attributes](../people-and-groups/managing.md#adding-user-attributes) as well.

## Creating an advanced sandbox

> Make sure to do the [prerequisites](#prerequisites) first.

1. Go to **Admin settings** > **Permissions**.
2. Select the database and table that you want to sandbox.
3. Find the group that you want to put in the sandbox.
4. Disable **Native query editing** for the group.
5. Click on the dropdown under **Data access** for that group.
6. Select "Sandboxed".
7. Select "Use a saved question to create a custom view for this table".
8. Select your saved question.
9. Optional: [add an attribute-based filter](#adding-a-filter-to-an-advanced-sandbox) to the saved question.
10. Go to **Collections** and set the permissions to **View** for any collections containing SQL questions that use the sandboxed data.

## Adding an attribute-based filter to an advanced sandbox

If you want an advanced data sandbox to display different rows to each person depending on their [user attributes](../people-and-groups/managing.md#adding-a-user-attribute):

1. Make sure you've done all the [prerequisites for advanced data sandboxes](#prerequisites-for-advanced-data-sandboxes).
2. Go to the SQL question that will be displayed to the people in the advanced sandbox.
3. Add a [parameterized](../questions/native-editor/sql-parameters.md) `WHERE` clause to your SQL query, such as `[[ WHERE Plan = {{Plan}} ]]`.
4. Save the SQL question.
5. Go to **Admin settings** > **Permissions**.
6. Find the group and table for your advanced sandbox.
7. Open the dropdown under **Data access**.
8. Click **Edit sandboxed access**.
9. Scroll down and set **Parameter or variable** to the name of the parameter in your saved SQL question.
10. Set the **User attribute** to the **key** of the [user attribute](../people-and-groups/managing.md#adding-a-user-attribute) to be filtered on.
11. Click **Save**.

### Example of an advanced data sandbox

1. Create a new SQL question with a subset of columns from the Accounts table:
    ```
    SELECT id, plan, source, seats, created_at
    FROM accounts
    ```
2. Optional: add the [parameterized](../questions/native-editor/sql-parameters.md) `WHERE` clause `[[ WHERE Plan = {{Plan}} ]]`.
3. Save the SQL question as "Sandboxed Accounts" in a private collection (either a personal collection or another admin-only collection).
4. Go to **Admin settings** > **Permissions**.
5. Select **Sample Database** > **Accounts**.
6. Click on the dropdown under **Data access** for the "Basic" group.
7. Select "Sandboxed".
8. Click the dropdown under **Column** and enter "Plan".
9. Click the dropdown under **User attribute** and enter "Plan".

To add an attribute-based filter to the sandbox:

1. Go to the "Sandboxed Accounts" SQL question.
2. Add a [parameterized](../questions/native-editor/sql-parameters.md) `WHERE` clause to your SQL query, so that the query becomes:
    ```
    SELECT id, plan, source, seats, created_at
    FROM accounts
    [[ WHERE Plan = {{Plan Name}} ]]
    ```
3. Save the SQL question.
4. Go to **Admin settings** > **People**.
5. Add or find a person.
6. Add a user attribute with a key named "Plan".
7. Set the user attribute value to "Basic", "Business", or "Premium".
8. Create a group called "Sandboxed People".
9. Add the person to the "Sandboxed People" group.
10. Go to **Admin settings** > **Permissions**.
11. From the sidebar, select the **Sandboxed People** group.
12. Select **Sample Database**.
13. Open the dropdown menu under **Data access** for the Accounts table.
14. Click **Edit sandboxed access**.
15. Scroll down and set the **Parameter or variable** dropdown to "Plan Name".
16. Set the **User attribute** dropdown to "Plan".
17. Click **Save**.

In this advanced sandboxing setup, everyone in the "Sandboxed People" group will see the results of the "Sandboxed Accounts" SQL question instead of the original Accounts table. 

"Sandboxed Accounts" will only display the columns ID, Plan, Source, Seats, and Created At. The rows will also get filtered to `Plan = Basic` for people with the user attribute `Plan = Basic`, `Plan = Business` for people with the user attribute `Plan = Business`, and so on.

## Required group permissions

Data sandboxes require some additional group permissions to work properly. You can add these permissions at any point in your data sandboxing setup:

- [Native query permissions](../permissions/data.md) must be **disabled** for the groups that will be added to a data sandbox.
- [Collection permissions](../permissions/collections.md) must be set to **View** for any collections containing [SQL questions](../questions/native-editor/writing-sql.md) that use sandboxed data for a given group.

For more info, see [Preventing data sandboxing permissions conflicts](#preventing-permissions-conflicts).

## How sandboxing permissions interact with other permissions

Let's say you have a data sandbox that displays the Accounts table without the Email column. Here's what you can expect when a sandboxed group tries to interact with something that contains the sandboxed Accounts data in Metabase:

- [Data browser](#data-browser)
- [Data reference](#data-reference)
- [Public links](#public-links)
- [Receiving subscriptions or alerts](#recieving-subscriptions-or-alerts)
- [Query builder](#query-builder)
- [Saved question (GUI)](#saved-question-gui)
- [Saved question (SQL)](#saved-question-sql)
- [Sending subscriptions or alerts](#sending-subscriptions-or-alerts)
- [SQL editor](#sql-editor)

### Data browser

Sandboxed groups will be restricted from seeing the Email column and values when selecting the Accounts table from the [data browser](../exploration-and-organization/exploration.md#browse-your-data).

### Data reference

Sandboxed groups will only be able to see a name and description for the Email column (but not the column values) from the [data reference](../exploration-and-organization/data-model-reference.md) for the Accounts table.

### Public links

Sandboxed groups can view the Email column values from a public link, if the public link includes the Email column. See [Preventing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

### Query builder

When creating a new question with the Accounts table in the query builder, sandboxed groups will be restricted from seeing the Email column and values.

### Recieving subscriptions or alerts

People in sandboxed groups can view the Email column in a dashboard subscription or alert if:

- The creator of the subscription or alert has permission to see the Email column.
- The subscription or alert includes the Email column.

See [Notification permissions](../permissions/notifications.md).

### Saved question (GUI)

When viewing or editing a saved GUI question that uses the Accounts table, groups will be restricted from seeing the Email column and values.

If the saved question uses a filter from the Accounts table like `Email = metabot@metabase.com`, sandboxed groups 

### Saved question (SQL)

Sandboxed groups will be able to see the Email column in a saved SQL question if the SQL query actually includes the Email column, _and_ the SQL question is saved in a collection that the sandboxed group can view or curate.

See [Preventing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

### Sending subscriptions or alerts

People in sandboxed groups can only see and add their own account to an alert or dashboard subscription.

See [Notification permissions](../permissions/notifications.md).

### SQL editor

Sandboxed groups with permission to create SQL questions will be able to query the Email column from the Accounts table. See [Preventing permissions conflicts](#preventing-data-sandboxing-permissions-conflicts).

## Preventing data sandboxing permissions conflicts

Some Metabase permissions can conflict with data sandboxing to give more permissive or more restrictive data access than you intended. It's a good idea to review your permissions for each of these scenarios:

- [Multiple data sandboxing permissions](#multiple-data-sandboxes)
- [Native query editing permissions](#native-query-editing-permissions)
- [Collections permissions](#collection-permissions)
- [Public sharing](#public-sharing)

### Multiple data sandboxing permissions

Each person can be added to a maximum of one data sandbox per table.

Remember that you can create one data sandbox (that is, one permission set) for each table and group pairing in your Metabase.

Since a single person can be added to multiple groups, they can belong to multiple data sandboxes that include the same table.

For example, if you have:

- One data sandbox for the group "Basic Accounts" that filters the Accounts table on `Plan = Basic`.
- Another data sandbox for the group "Converted Accounts" that filters the Accounts table on `Trial Converted = true`.

If you put Vincent Accountman in both groups, he'll get conflicting data sandboxes on the Accounts table, and get an error message whenever he tries to use Accounts in Metabase.

When you have conflicting data sandboxes for a person in multiple groups:

- Remove the person from all but one of the groups.
- Remove all but one of the data sandboxes for that table (change the table's data access to **No self-service**).

### Native query editing permissions

People with **native query editing** permissions will always be able to write SQL queries using the original tables in a database, even if you add them to a data sandbox.

If you put Vincent Accountman in two different groups:

- One group with **Native query editing** permissions to the Sample Database.
- One group with **Sandboxed** permissions to the Accounts table in the Sample Database.

Vincent's native query permissions will override his sandboxing permissions, so he'll still be able to write SQL queries using the original, unfiltered Accounts table.

### Collection permissions

Data sandboxing permissions don't apply to the results of SQL questions. Metabase doesn't know what tables are included in a SQL query, so SQL questions will always display results from the original (non-sandboxed) version of a table.

Say that you normally have a data sandbox for the Accounts table that excludes the "Email" column. If someone makes a SQL question using the Accounts table and includes the "Email" column, **anyone with collection permissions to view that SQL question** will be able to:

- See the "Email" column in the SQL question results.
- Use the SQL question to start a new question that includes the "Email" column.

That is, when it comes to SQL questions, people's collection permissions will override data sandboxing permissions. 

To prevent people in a data sandbox from viewing the original (non-sandboxed) Accounts via a SQL question:

- Put any SQL questions using the Accounts table in a separate collection.
- Set the [collection permissions](../permissions/collections.md) to **No access** for groups who should only see sandboxed versions of the Accounts table.

### Public sharing

Data sandboxing permissions don't apply to public questions or public dashboards.

Metabase can display the sandboxed version of a table using the group membership and user attributes of people who are logged in. Since public links don't require logins, Metabase won't have enough info to create the sandbox.

If someone creates a public link using data from a sandboxed table, the public link may display non-sandboxed data (depending on the question or dashboard in the link).

To prevent this from happening, you'll have to [disable public sharing](../questions/sharing/public-links.md) for your Metabase instance.

## Limitations

Data sandboxing is unavailable for non-SQL databases such as Google Analytics, Apache Druid, or MongoDB.

## Further reading

- [Data sandboxing: setting row-level permissions](https://www.metabase.com/learn/permissions/data-sandboxing-row-permissions)
- [Advanced data sandboxing: limiting access to columns](https://www.metabase.com/learn/permissions/data-sandboxing-column-permissions)
- [SSO](../people-and-groups/start.md#authentication)
