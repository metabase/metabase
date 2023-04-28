---
title: Data sandboxes
---

# Data sandboxes

{% include plans-blockquote.html feature="Data sandboxes" %}

Data sandboxes let you give granular permissions to rows and columns for different groups of people.

You can think of a data sandbox as a permissions "container" that includes:

- The edited version of a table in your database that has some rows or columns removed.
- The [group](../people-and-groups/managing.md#groups) of people who should see the edited version of the table instead of the original table everywhere in Metabase.

You can define one data sandbox (that is, one permission set) for each table and group pairing in your Metabase.

## Types of data sandboxes

For each group and table pairing, you can choose between:

- [Row-limiting data sandboxes](#row-limiting-data-sandboxes): hide rows from a table based on user attributes.
- [Advanced data sandboxes](#advanced-data-sandboxes): display a custom query result in place of a table (filtering on user attributes is optional).

### Row-limiting data sandboxes

A row-limiting sandbox displays the result of a filtered table. Groups assigned to a row-limiting sandbox will see a sandboxed table with `Filter = Value` instead of the original table (everywhere in Metabase).

For example, you can create a row-limiting sandbox to filter the Accounts table so that people can only see rows where `Plan = Basic`.

You could also set up the sandbox so that one person sees the rows where `Plan = Basic`, and another person only sees the rows where `Plan = Premium`. A data sandbox can dynamically set the filter value ("Basic", "Premium") to hide different rows for each person based on their [user attributes](../people-and-groups/managing.md#adding-user-attributes).

## Advanced data sandboxes

An advanced sandbox displays the results of a saved question in place of a table. This type of sandbox must be used if you want to **limit the columns** in a table.

For example, you can create a saved question called "Sandboxed Accounts" that excludes all columns with personal info (names, emails, etc) from the Accounts table. 

An advanced sandbox would display the "Sandboxed Accounts" question to a group in place of the original Accounts table, everywhere that the Accounts table is used in Metabase.

Advanced sandboxes can also be set up to display joined data, filters, custom columns, aggregations, and so on.

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
5. Optional: create a group called "Sandboxed People".
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
- Optional: [User attributes](../people-and-groups/managing.md#adding-a-user-attribute) to the people in the group.

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

1. Add a [variable]() to your saved SQL question.
2. ...

### Example of an advanced data sandbox

1. Go to **Admin settings** > **People**.
2. Add or find a person.
3. Add a user attribute with a key named "Plan".
4. Set the user attribute value to "Basic", "Business", or "Premium".
5. Optional: create a group called "Sandboxed People".
6. Add the person to the "Sandboxed People" group.
7. Go to **Admin settings** > **Permissions**.
8. Select **Sample Database** > **Accounts**.
9. Click on the dropdown under **Data access** for the "Basic" group.
10. Select "Sandboxed".
11. Click the dropdown under **Column** and enter "Plan".
12. Click the dropdown under **User attribute** and enter "Plan".

## Required group permissions

Data sandboxes require some additional group permissions to work properly. You can add these permissions at any point in your data sandboxing setup:

- [Native query permissions](../permissions/data.md) must be **disabled** for the groups that will be added to a data sandbox.
- [Collection permissions](../permissions/collections.md) must be set to **View** for any collections containing [SQL questions](../questions/native-editor/writing-sql.md) that use sandboxed data for a given group.

For more info, see [Preventing data sandboxing permissions conflicts](#preventing-permissions-conflicts).

## How sandboxing permissions interact with other permissions

What to expect when a sandboxed person tries to interact with something that contains sandboxed data:

- Data picker, data browser, and data reference
- Query builder (GUI) questions
- Native editor (SQL) questions
- Collections
- Dashboard subscriptions and alerts
- Public links

### Data picker, data browser, and data reference

Let's say you have a data sandbox that displays the Accounts table without the Email column. Groups in that data sandbox will:

- 

### Query builder

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

## Native query editing permissions

People with **native query editing** permissions will always be able to write SQL queries using the original tables in a database, regardless of whether they belong to a data sandbox.

If you put Vincent Accountman in two different groups:

- One group with **Native query editing** permissions to the Sample Database.
- One group with **Sandboxed** permissions to the Accounts table in the Sample Database.

Vincent's native query permissions will override the sandboxing permissions, so he'll still be able to write SQL queries using the original, unfiltered Accounts table.

### Collection permissions

Data sandboxing permissions don't apply to the results of SQL questions. Metabase doesn't know what tables are included in a SQL query, so SQL questions will always display results from the original (non-sandboxed) version of a table.

Say that you normally have a data sandbox for the Accounts table that excludes the "Email" column. If someone makes a SQL question using the Accounts table and includes the "Email" column, **anyone with collection permissions to view that SQL question** will be able to:

- See the "Email" column in the SQL question results.
- Use the SQL question to start a new question that includes the "Email" column.

That is, when it comes to SQL questions, people's collection permissions will override data sandboxing permissions. 

To people in a data sandbox from potentially viewing the original (non-sandboxed) Accounts via a SQL question:

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
