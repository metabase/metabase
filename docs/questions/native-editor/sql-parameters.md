---
title: SQL parameters
summary: Create SQL templates by adding filters and parameters to your SQL questions in the native code editor.
redirect_from:
  - /docs/latest/users-guide/13-sql-parameters
---

# SQL parameters

![Variables](../images/filter-and-parameter.png)

You can create SQL templates by adding parameters (a.k.a. variables) to your SQL queries in the [Native/SQL editor](./writing-sql.md).

These variables create widgets that people can use to change the variables' values in the query. You can also connect [dashboard widgets to these parameters](../../dashboards/filters.md).

You can also add parameters to your question's URL to set the filters' values, so that when the question loads, those values are inserted into the variables.

## SQL variable types

When you define a variable, the **variables and parameters** side panel will appear. You can set a type for a variable, which changes the kind of filter widget that Metabase presents.

Variable types include:

- **[Field filter variables](./field-filters.md)**: create "smart" filter widgets with date pickers or dropdown menus. To use a field filter, you'll need to connect to a database field included in your query.
- **[Basic variables](./basic-sql-parameters.md)**: text, number, and date variables. You'll almost always want to use field filters instead of these basic variables, as field filters create "smart" filter widgets, but Metabase provides these basic variables for situations where you can't use field filters.
- **[Time grouping parameters](./time-grouping-parameters.md)**: allows people to change how the results are grouped by a date column: by month, week, day, etc.

You can include multiple variables in a single query, and Metabase will add multiple widgets to the question. To rearrange the order of the widgets, enter edit mode and click on any widget and drag it around.

### Configure your filter widget

1. Set the **Filter widget type**. Options will differ depending on whether you used a field filter or a basic variable.
2. Set the **Filter widget** label.
3. Set **How should users filter on this variable?**:
   - [Dropdown list](../../dashboards/filters.md#dropdown-list). A dropdown list shows all available values for the field in a selectable list.
   - [Search box](../../dashboards/filters.md#search-box). A search box allows people to type to search for specific values.
   - [Input box](../../dashboards/filters.md#plain-input-box). An input box provides a simple text field for entering values.
4. If the filter is mapped to a field in an aliased table, you'll need to [specify the table and field alias](./field-filters.md#specifying-the-table-and-field-alias).
5. Optionally, set a **Default filter widget value**.

Check out [filter widgets](./filter-widgets.md).

## Setting values for SQL variables

To set a SQL variable to a value, you can either:

- Enter a value into the filter widget, and re-run the question.
- Add a parameter to the URL and load the page.

### Setting a parameter via URL

To add a value to the URL, follow this syntax:

```
?variable_name=value
```

For example, to set the `{% raw %}{{category}}{%endraw%}` variable on a question to the value "Gizmo", your URL would look something like:

```
https://metabase.example.com/question/42-eg-question?category=Gizmo
```

To set multiple variables, separate parameters with an ampersand (`&`):

```
https://metabase.example.com/question/42-eg-question?category=Gizmo&maxprice=50
```

### Setting complex default values in the query

You can also define default values directly in your query by enclosing comment syntax inside the end brackets of an optional parameter.

```sql
WHERE column = [[ {% raw %}{{ your_parameter }}{% endraw %} --]] your_default_value
```

The comment will "activate" whenever you pass a value to `your_parameter`.

This is useful when defining complex default values (for example, if your default value is a function like `CURRENT_DATE`). Here's a PostgreSQL example that sets the default value of a Date filter to the current date using `CURRENT_DATE`:

```sql
{% raw %}
SELECT
  *
FROM
  orders
WHERE
  DATE(created_at) = [[ {{dateOfCreation}} --]] CURRENT_DATE
{% endraw %}
```

If you pass a value to the variable, the `WHERE` clause runs, including the comment syntax that comments out the default `CURRENT_DATE` function.

Note that the hash (`--`) used to comment the text might need to be replaced by the comment syntax specific to the database you're using.

## Making variables optional

You can make a clause optional in a query. For example, you can create an optional `WHERE` clause that contains a SQL variable, so that if no value is supplied to the variable (either in the filter or via the URL), the query will still run as if there were no `WHERE` clause.

To make a variable optional in your native query, put `[[ .. ]]` brackets around the entire clause containing the `{% raw %}{{variable}}{% endraw %}`. If someone inputs a value in the filter widget for the `variable`, Metabase will place the clause in the template; otherwise Metabase will ignore the clause and run the query as though the clause didn't exist.

In this example, if no value is given to `cat`, then the query will just select all the rows from the `products` table. But if `cat` does have a value, like "Widget", then the query will only grab the products with a category type of Widget:

```sql
{% raw %}
SELECT
  count(*)
FROM
  products
[[WHERE category = {{cat}}]]
{% endraw %}
```

### Your SQL must also be able to run without the optional clause in `[[ ]]`

You need to make sure that your SQL is still valid when no value is passed to the variable in the bracketed clause.

For example, excluding the `WHERE` keyword from the bracketed clause will cause an error if there's no value given for `cat`:

```sql
-- this will cause an error:
{% raw %}
SELECT
  count(*)
FROM
  products
WHERE
  [[category = {{cat}}]]
{% endraw %}
```

That's because when no value is given for `cat`, Metabase will try to execute SQL as if the clause in `[[ ]]` didn't exist:

```sql
SELECT
  count(*)
FROM
  products
WHERE
```

Which is not a valid SQL query. Instead, put the entire `WHERE` clause in `[[ ]]`:

```sql
{% raw %}
SELECT
  count(*)
FROM
  products
[[WHERE
  category = {{category}}]]
{% endraw %}
```

When there's no value given for `category`, Metabase will still execute a valid query:

```sql
{% raw %}
SELECT
  count(*)
FROM
  products
{% endraw %}
```

### You need at least one `WHERE` when using multiple optional clauses

To use multiple optional clauses, you must include at least one regular `WHERE` clause followed by optional clauses, each starting with `AND`:

```sql
{% raw %}
SELECT
  count(*)
FROM
  products
WHERE
  TRUE
  [[AND id = {{id}}]]
  [[AND {{category}}]]
{% endraw %}
```

That last clause uses a [field filter](./field-filters.md) (note the lack of a column in the `AND` clause). When using a field filter, you must exclude the column in the query; you need to map the variable in the side panel.

### Optional variables in MongoDB

If you're using MongoDB, you can make a clause optional like so:

```
{% raw %}
[
    [[{
        $match: {category: {{cat}}}
    },]]
    {
        $count: "Total"
    }
]
{% endraw %}
```

Or with multiple optional filters:

```
{% raw %}
[
    [[{ $match: {{cat}} },]]
    [[{ $match: { price: { "$gt": {{minprice}} } } },]]
    {
        $count: "Total"
    }
]
{% endraw %}
```

## Connecting a SQL question to a dashboard filter

In order for a SQL/native question to be usable with a dashboard filter, the question must contain at least one variable or parameter.

The kind of dashboard filter that can be used with the SQL question depends on the field. For example, if you have a field filter called `{% raw %}{{var}}{% endraw %}` and you map it to a field with State semantic type, you can map a location dashboard filter to your SQL question. In this example, you'd:

1. Create a new dashboard (or go to an existing dashboard).
2. Click the **Pencil icon** to enter **Dashboard edit mode**.
3. Add the SQL question that contains your `State` field filter.
4. Add a new dashboard filter (or edit an existing Location filter).
5. Click the dropdown on the SQL question card to connect the widget to the `State` field filter.

If you add a basic **Date** variable to the question (i.e., not a field filter), then it's only possible to use the dashboard filter option **Single Date**. So if you're trying to use one of the other Time options on the dashboard, you'll need to change the variable to a [field filter](./field-filters.md) and map it to a date field.

![Field filter](../images/state-field-filter.png)

## Further reading

- [Create filter widgets for charts using SQL variables](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/sql-variables).
- [Field Filters: create smart filter widgets for SQL questions](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters).
- [Troubleshooting SQL](../../troubleshooting-guide/sql.md).
- [Troubleshooting filters](../../troubleshooting-guide/filters.md).
- [Dashboard filters](../../dashboards/filters.md).
