---
title: Referencing models and saved questions
redirect_from:
  - /docs/latest/users-guide/referencing-saved-questions-in-queries
---

## Referencing models and saved questions

With SQL databases, we can use a [model][model] or an existing question as the basis for a new query, or as a common table expression [CTE][CTE].

For example, let's say we have a lot of data spread across a number of tables, but our users are most interested in a subset of that data. We can perform a complicated query once to return those results, and save that question as a model, which people can refer to in their queries just like they would with any other table.

Here's how it works. First, create and save a question that returns the result set you'd like to make available for people to query. Using the sample database included with Metabase as an example, let's say we want to provide a result set (a "table") that only has orders from 2019, and only includes orders for products in the Gizmo category.

We could create this model using the notebook editor, like so:

![Example notebook](../images/example-notebook.png).

Alternatively, we could create that model from a SQL question:

```
SELECT *
FROM   orders AS o
       INNER JOIN products AS p
               ON o.product_id = p.id
WHERE  p.category = 'Gizmo'
       AND o.created_at BETWEEN '2019-01-01' AND '2019-12-31'
```

We'll save that question as "Gizmo orders in 2019", then we'll convert it to a [model][model].

Now let's refer to "Gizmo orders in 2019" in a new query. To keep it simple, let's say we just want to count all of those Gizmo orders from 2019. We can use the `#` symbol to refer to a saved question in a query.

If we type out:

```
SELECT count(*)
FROM {% raw %}{{#{% endraw %}
```

Metabase will slide out a sidebar where we can select a question to reference. We'll search for our "Gizmo orders in 2019" question:

![Select a question from the variable sidebar](../images/variable-sidebar.png)

We'll select that question, and Metabase will update our code with the question's ID, `5`:

```
SELECT count(*)
FROM {% raw %}{{#5-gizmo-orders-in-2019}}{% endraw %}
```

This query returns the number of rows in our saved question.

## Model, table, or saved question as a Common Table Expression (CTE)

The same syntax can be used in [Common Table Expressions (CTEs)](https://www.metabase.com/learn/sql-questions/sql-cte) (with SQL databases that support CTEs):

```
WITH gizmo_orders AS {% raw %}{{#5-gizmo-orders-in-2019}}{% endraw %}
SELECT count(*)
FROM gizmo_orders
```

When this query is run, the `{% raw %}{{#5-gizmo-orders-in-2019}}{% endraw %}` tag will be substituted with the SQL query of the referenced question, surrounded by parentheses. So it'll look like this under the hood:

```
WITH gizmo_orders AS (SELECT *
FROM   orders AS o
       INNER JOIN products AS p
               ON o.product_id = p.id
WHERE  p.category = 'Gizmo'
       AND o.created_at BETWEEN '2019-01-01' AND '2019-12-31')
SELECT count(*)
FROM gizmo_orders
```

## Search for models and questions as you type

Use the typeahead search in the your variable to find your model or question. Type `{% raw %}{{#your search term }} {% endraw %}` and Metabase will display

Selecting a question from the variable sidebar in the SQL editor will automatically add the ID number to the variable in our query.

You can also navigate to the model or question you'd like to reference and find its ID in the URL in your browser's address bar, after `/model/` or `/question/`. E.g., for `https://metabase.example.com/model/12345-example-name`, the model's ID would be `12345`.

## Limitations and tradeoffs

- You can only reference a model or saved question in a query when working with a SQL database like PostgreSQL, MySQL, Snowflake or SQL Server.
- The model or saved question you select has to be one that's based on the same database as the one you've currently selected in the native query editor.
- You cannot refer to variables in sub-queries. You only have access to the _results_ of the model or saved question, not the model or saved question's query. For example, if you have a saved question that uses a [field filter](https://www.metabase.com/learn/building-analytics/sql-templates/field-filters), you won't be able to reference that variable. If you need to change how the saved question has filtered the results, you'll need to update (or duplicate) that question and apply the filter.

## Further reading

- [Models](../../data-modeling/models.md)
- [SQL Snippets](https://www.metabase.com/learn/building-analytics/sql-templates/sql-snippets.html)
- [SQL Snippets vs Saved Questions vs. Views](https://www.metabase.com/learn/building-analytics/sql-templates/organizing-sql.html)
- [SQL troubleshooting guide](../../troubleshooting-guide/sql.md).
- [Segments and Metrics](../../data-modeling/segments-and-metrics.md)


[cte]: https://www.metabase.com/learn/sql-questions/sql-cte
[model]: ../../data-modeling/models.md
