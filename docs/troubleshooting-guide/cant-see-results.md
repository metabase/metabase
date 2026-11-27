---
title: Someone can't see a question's results
summary: Work out why someone can see a question or a dashboard card, but not its results, by checking collection permissions, then the data permissions of every source the question uses.
---

# Someone can't see a question's results

If someone can open a dashboard but a card says "Sorry, you don't have permission to see this card", or if they can open a question but can't see its results, the problem can come from two different kinds of permissions:

- [Collection permissions](../permissions/collections.md) control who can see a question or a dashboard.
- [Data permissions](../permissions/data.md) control who can see the data that the question returns.

People need both to see a question's results. Work through the checks below in order.

## Check that the person can access the question's collection

1. Find the collection where the question is saved. On a dashboard, check each card, because a dashboard can show questions that are saved in other collections.
2. Go to **Admin** > **Permissions** > **Collections** and check whether one of the person's groups has **View** or **Curate** access to that collection.
3. If not, give the group access to the collection, or ask someone with **Curate** access to move the question to a collection that the group can access.

**Explanation**

Moving a dashboard to a different collection doesn't move the dashboard's questions into that collection. If a question on the dashboard is saved in a collection that the person can't access (for example, someone's personal collection), the person can see the dashboard, but not that card. See [Dashboards with questions from multiple collections](../permissions/collections.md#dashboards-with-questions-from-multiple-collections).

## If the question uses SQL, check for blocked tables in its database

{% include plans-blockquote.html feature="Blocked view data permission" %}

1. Go to **Admin** > **Permissions** > **Data** and select the person's group.
2. Check the **View data** permission for the database that the question queries. Check every schema and table in that database, not just the tables that the SQL uses.
3. If any table in the database is **Blocked** for the group, and none of the person's other groups has **Can view** for that table, the person can't see the results of SQL questions on that database.

Also do this check for questions built in the query builder that use a SQL question as a data source, at any step in the chain.

**Explanation**

Metabase can't tell which tables a SQL query reads, so if you block even one table in a database for a group, that group can't view the results of SQL questions that query that database. See [Blocked view data permission](../permissions/data.md#blocked-view-data-permission).

## If the question uses the query builder, check every source table and question

1. Open the question in the editor and note its data source and each joined table or question.
2. If a source is another question or a model, open that one too, and repeat until you reach the tables at the start of the chain.
3. For each table that you found, go to **Admin** > **Permissions** > **Data** and check the person's groups' **View data** permission.
4. If a table is **Blocked** for all of the person's groups, the person can't see the results of the question. Change the group's permission to that table, or change the question to use a different source.

**Explanation**

A question is only as visible as its sources. Metabase checks the data permissions for every table that the question reads, including the tables that its source questions and models read, all the way up the chain.

## Use the dependency graph to find every source of a question

{% include plans-blockquote.html feature="Dependency graph" %}

Tracing a long chain of questions and models by hand is tedious. The [dependency graph](../data-modeling/tools/graph.md) shows what a question depends on, including source questions, models, and tables, so you can find each table to check in one place.

## Check what the person sees

To confirm what someone can see after you change permissions:

1. Open an incognito browser window.
2. Log in to Metabase as the person in question, or as a test account in the same groups.
3. Open the question or dashboard.

## Related problems

- [My permissions aren't working](./permissions.md).
- [I can't view or edit my question or dashboard](./cant-view-or-edit.md).
- [A user group has the wrong access to a table or schema](./data-permissions.md#a-user-group-has-the-wrong-access-to-a-table-or-schema).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
