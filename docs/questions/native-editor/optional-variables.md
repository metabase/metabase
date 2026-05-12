---
title: Optional variables
summary: Make parts of your SQL query optional by wrapping clauses in double brackets.
---

# Optional variables

You can make a clause optional in a query. For example, you can create an optional `WHERE` clause that contains a [SQL variable](./sql-parameters.md), so that if no value is supplied to the variable (either in the filter or via the URL), the query will still run as if there were no `WHERE` clause.

To make a variable optional in your native query, put `[[ .. ]]` brackets around the entire clause containing the `{{variable}}`. If someone inputs a value in the filter widget for the `variable`, Metabase will place the clause in the template; otherwise Metabase will ignore the clause and run the query as though the clause didn't exist.

In this example, if no value is given to `cat`, then the query will just select all the rows from the `products` table. But if `cat` does have a value, like "Widget", then the query will only grab the products with a category type of Widget:

```sql

SELECT
  count(*)
FROM
  products
[[WHERE category = {{cat}}]]

```

### Your SQL must also be able to run without the optional clause in `[[ ]]`

You need to make sure that your SQL is still valid when no value is passed to the variable in the bracketed clause.

For example, excluding the `WHERE` keyword from the bracketed clause will cause an error if there's no value given for `cat`:

```sql
-- this will cause an error:

SELECT
  count(*)
FROM
  products
WHERE
  [[category = {{cat}}]]

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

SELECT
  count(*)
FROM
  products
[[WHERE
  category = {{cat}}]]

```

When there's no value given for `cat`, Metabase will still execute a valid query:

```sql

SELECT
  count(*)
FROM
  products

```

### You need at least one `WHERE` when using multiple optional clauses

To use multiple optional clauses, you must include at least one regular `WHERE` clause followed by optional clauses, each starting with `AND`:

```sql

SELECT
  count(*)
FROM
  products
WHERE
  TRUE
  [[AND id = {{id}}]]
  [[AND {{category}}]]

```

That last clause uses a [field filter](./field-filters.md) (note the lack of a column in the `AND` clause). When using a field filter, you _must_ exclude the column in the query; you need to map the variable in the side panel.

### Optional variables in MongoDB

If you're using MongoDB, you can make a clause optional like so:

```

[
    [[{
        $match: {category: {{cat}}}
    },]]
    {
        $count: "Total"
    }
]

```

Or with multiple optional filters:

```

[
    [[{ $match: {{cat}} },]]
    [[{ $match: { price: { "$gt": {{minprice}} } } },]]
    {
        $count: "Total"
    }
]

```

## Setting complex default values in the query

You can also define default values directly in your query by enclosing comment syntax inside the end brackets of an optional parameter.

```sql
WHERE column = [[ {{ your_parameter }} --]] your_default_value
```

The comment will "activate" whenever you pass a value to `your_parameter`.

This is useful when defining complex default values (for example, if your default value is a function like `CURRENT_DATE`). Here's a PostgreSQL example that sets the default value of a Date filter to the current date using `CURRENT_DATE`:

```sql

SELECT
  *
FROM
  orders
WHERE
  DATE(created_at) = [[ {{dateOfCreation}} --]] CURRENT_DATE

```

If you pass a value to the variable, the `WHERE` clause runs, including the comment syntax that comments out the default `CURRENT_DATE` function.

Note that the hash (`--`) used to comment the text might need to be replaced by the comment syntax specific to the database you're using.
