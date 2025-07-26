---
title: SQL parameters
summary: Create SQL templates by adding filters and parameters to your SQL questions in the native code editor.
redirect_from:
  - /docs/latest/users-guide/13-sql-parameters
---

# SQL parameters

![Variables](../images/filter-and-parameter.png)

You can create SQL templates by adding parameters (a.k.a. variables) to your SQL queries in the [Native/SQL editor](./writing-sql.md).

These variables create widgets that people can use to change the variables' values in the query.

You can also add parameters to your question's URL to set the filters' values, so that when the question loads, those values are inserted into the variables.

## SQL variable types

When you define a variable, the **variables and parameters** side panel will appear. You can set a type for a variable, which changes the kind of filter widget that Metabase presents.

Variable types include:

- **[Field filter variables](#field-filter-variables)**: create "smart" filter widgets with date pickers or dropdown menus. To use a field filter, you'll need to connect to a database field included in your query.
- **[Basic variables](./basic-sql-parameters.md)**: text, number, and date variables. You'll almost always want to use field filters instead of these basic variables, as field filters create "smart" filter widgets, but Metabase provides these basic variables for situations where you can't use field filters.
- **[Time grouping parameters](./time-grouping-parameters.md)**: allows people to change how the results are grouped by a date column: by month, week, day, etc.

You can include multiple variables in a single query, and Metabase will add multiple widgets to the question. To rearrange the order of the widgets, enter edit mode and click on any widget and drag it around.

## When to use a field filter variable vs a basic variable

In general, prefer using field filter variables. They offer "smart" filter widgets with dropdown menus and dynamic date pickers.

If your query lacks a database field for the filter to connect to, however, then you'll instead need to use a [basic variable](./basic-sql-parameters.md). See other [field filter limitations](#field-filter-limitations).

## Field filter variables

To add a field filter:

1. [Add a variable to a `WHERE` clause](#field-filter-syntax).
2. [Connect the field filter to a database field](#connect-the-field-filter-to-a-database-field).
3. [Configure your filter widget](#configure-your-filter-widget).

### Field filter syntax

Let's say you want to create a field filter variable that filters the `People` table by the `state` field.

Here's the field filter syntax:

```sql
{% raw %}
SELECT
  *
FROM
  PEOPLE
WHERE
  {{state}}
{% endraw %}
```

Note the lack of the column and operator (it's not `{% raw %}WHERE state = {{state}}{% endraw %}`, it's just `{% raw %}WHERE {{state}}{% endraw %}`). The reason you need to structure field filter variables in this way is to handle cases where Metabase generates the code for you. For example, for handling cases where someone selects _multiple_ values in the filter widget, or a _range_ of dates, Metabase will have to interpolate the SQL code to handle those inputs into the variable.

In a MongoDB native query, you'll need to put the field filter in a `$match` clause.

```
{% raw %}[ {$match: {{date_var}} } ]{% endraw %}
```

### Connect the field filter to a database field

In order for a field filter variable to work, you'll need to associate the variable with a database field.

1. Go to the variables and parameters side panel.
2. Under **Variable type**, select the "Field filter" variable type.
3. Choose which **Field to map to** your variable (in this case, we'll map the `Category` field in the products table).

You can only map a field filter to a database field. See [field filter limitations](#field-filter-limitations).

### Configure your filter widget

1. Set the **Filter widget type**. Options will differ depending on the field's data type.
2. Set the **Filter widget** label.
3. Set **How should users filter on this variable?**:
   - [Dropdown list](../../dashboards/filters.md#dropdown-list). A dropdown list shows all available values for the field in a selectable list.
   - [Search box](../../dashboards/filters.md#search-box). A search box allows people to type to search for specific values.
   - [Input box](../../dashboards/filters.md#plain-input-box). An input box provides a simple text field for entering values.
4. If the filter is mapped to a field in an aliased table, you'll need to [specify the table and field alias](#specifying-the-table-and-field-alias).
5. Optionally, set a **Default filter widget value**.

Check out [filter widgets](./filter-widgets.md).

### Specifying the table and field alias

If you map a filter to a field from an aliased table, you'll need to tell Metabase about that alias, or the filter won't work. 

For example, let's say you want to map a field filter to the `category` field from the `products` table, but in your query you use the alias `p` for the `products` table, like so:

```sql
{% raw %}
SELECT
  *
FROM
  products AS p
WHERE
  {{category_filter}}
{% endraw %}
```

If you map to the `category` field from the products table, you'll also need to fill out the **Table and field alias** input to let Metabase know about the alias. In this case, you input `p.category`.

Setting this **Table and field alias** is only required if your query uses an alias to refer to a table that contains the field you want to map the filter to.

Here's another example, this time with a CTE

```sql
{% raw %}
WITH
  expensive_products AS (
    SELECT
      *
    FROM
      products
    WHERE
      price > 50
  )
SELECT
  *
FROM
  expensive_products
WHERE
  {{category_filter}}
{% endraw %}
```

Here, we again map the field filter to the`category` field in the `products` table. But since we use a CTE, aliased as `expensive_products`, we'd need to put `expensive_products.category` in the **Table and field alias** input for the mapping to work correctly.

## Field filter limitations

Field filters:

- [Must be connected to database fields included in the query](#field-filters-must-be-connected-to-database-fields-included-in-the-query)
- [Are only compatible with certain types](#field-filters-are-only-compatible-with-certain-types)

### Field Filters must be connected to database fields included in the query

Your main query should be aware of all the tables that your Field Filter variable is pointing to, otherwise you'll get a SQL syntax error. For example, let's say that your main query includes a field filter like this:

```sql
{% raw %}
SELECT
  *
FROM
  ORDERS
WHERE
  {{ product_category }}
{% endraw %}
```

Let's say the `{% raw %}{{ product_category }}{% endraw %}` variable refers to another question that uses the `Products` table. For the field filter to work, you'll need to include a join to `Products` in your main query.

```sql
{% raw %}
SELECT
  *
FROM
  ORDERS
  JOIN PRODUCTS ON ORDERS.product_id = PRODUCTS.id
WHERE
  {{ product_category }}
{% endraw %}
```

### Field filters are only compatible with certain types

- Category
- Entity Name
- Entity Key
- Foreign Key
- City
- State
- ZIP or Postal Code
- Date
- Timestamp

The field can also be a date or timestamp, even when the field is set to "No semantic type" in the [Table Metadata](../../data-modeling/metadata-editing.md).

If you want to map a Field Filter to a field that isn't one of the compatible types listed above, you'll need an Admin to change the field type for that column. See [metadata editing](../../data-modeling/metadata-editing.md).

## Field filters in BigQuery and Oracle

Make sure your SQL dialect matches the database you've selected. Common issues involving how tables are quoted in the query:

| Database | Dialect quirk                                       | Example                    |
| -------- | --------------------------------------------------- | -------------------------- |
| BigQuery | Schemas and tables must be quoted with backticks.   | `` FROM `dataset.table` `` |
| Oracle   | Schemas and tables must be quoted in double quotes. | `FROM "schema.table"`      |

For more help, see [Troubleshooting SQL error messages](../../troubleshooting-guide/error-message.md#sql-editor).

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

## Setting a default value in the filter widget

In the variables sidebar, you can set a default value for your variable. This value will be inserted into the corresponding filter widget by default (even if the filter widget is empty).

To override the default value, insert a new value into the filter widget.

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

That last clause uses a Field filter (note the lack of a column in the `AND` clause). When using a field filter, you must exclude the column in the query; you need to map the variable in the side panel.

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

The kind of dashboard filter that can be used with the SQL question depends on the field. For example, if you have a field filter called `{% raw %}{{var}}{% endraw %}` and you map it to a State field, you can map a location dashboard filter to your SQL question. In this example, you'd:

1. Create a new dashboard (or go to an existing dashboard).
2. Click the **Pencil icon** to enter **Dashboard edit mode**.
3. Add the SQL question that contains your `State` field filter.
4. Add a new dashboard filter (or edit an existing Location filter).
5. Click the dropdown on the SQL question card to connect the widget to the `State` field filter.

If you add a basic **Date** variable to the question (i.e., not a field filter), then it's only possible to use the dashboard filter option **Single Date**. So if you're trying to use one of the other Time options on the dashboard, you'll need to change the variable to a [field filter](#field-filter-variables) and map it to a date field.

![Field filter](../images/state-field-filter.png)

## Further reading

- [Create filter widgets for charts using SQL variables](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/sql-variables).
- [Field Filters: create smart filter widgets for SQL questions](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters).
- [Troubleshooting SQL](../../troubleshooting-guide/sql.md).
- [Troubleshooting filters](../../troubleshooting-guide/filters.md).
- [Dashboard filters](../../dashboards/filters.md).
