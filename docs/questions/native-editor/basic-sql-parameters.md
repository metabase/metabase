---
title: Basic SQL parameters
summary: Text, number, and date variables let you plug basic values into your SQL code.
---

# Basic SQL parameters

> If you want to filter on a database field in your query, you should prefer using [field filter variables](./sql-parameters.md), which require a different syntax.

Text, number, and date variables let you plug basic values into your SQL code. 

To add a basic variable to a SQL query, enclose the variable in double braces: `{% raw %}{{variable_name}}{% endraw %}`.

This example defines a **Text** variable called `category_filter` (but you can call the variable whatever you want):

```sql
{% raw %}
SELECT
  count(*)
FROM
  products
WHERE
  category = {{category_filter}}
{% endraw %}
```

These basic variabless simply plug in the values set by the widget into the placeholder in the code. Basic variables have a different syntax than [field filters](./sql-parameters.md).

Here's the [field filter](./field-filters.md) syntax:

```sql
{% raw %}
WHERE
  {{category}}
{% endraw %}
```

Whereas the basic variable syntax includes an `=` operator:

```sql
{% raw %}
WHERE
  category = {{category}}
{% endraw %}
```

Here, we don't connect the variable to a database field; we merely insert the value into the variable.

Metabase will read the variable and attach a filter widget to the query, which people can use to change the value inserted into the `category` variable. So if someone enters "Gizmo" into the filter widget, the query Metabase would run would be:

```sql
SELECT
  count(*)
FROM
  products
WHERE
  category = 'Gizmo'
```

If you're writing a native MongoDB query, your query would look more like this, with the `category` variable being defined inside the `match` clause:

```
{% raw %}[{ $match: { category: {{category}} } }]{% endraw %}
```

## Basic variable that allows people to select multiple values

![Basic variable with multiple values](../images/multiple-values.png)

To let people plug multiple values into your variable, you'll need to write the code in such a way that multiple values will make sense when interpolated into your code. The most common way to do this would be to use an `WHERE` clause with `IN`:

```sql
{% raw %}
SELECT
  *
FROM
  products
WHERE
  category IN ({{category_vars}})
{% endraw %}
```

With your code in place, you'll need to set the **People can pick** setting to multiple values. In this case, however, you're probably better off using a [field filter](./field-filters.md).

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

## Setting complex default values in the query

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

## Basic SQL variables offer limited options for filter types

- **Text**: a plain input box
- **Number**: a plain input box
- **Date**: a simple date picker
- **Boolean**: a this or that picker.

If you want a more expressive filter widget, like a dynamic date picker, you should use a [field filter variable](./field-filters.md).
