---
title: Field filters
summary: Field filters let you create smart filter widgets for your SQL questions by connecting variables to database fields. Where possible, prefer field filters to basic variables.
---

# Field filters

Field filters are special variables that you can connect directly to database fields.

## When to use a field filter variable vs a basic variable

In general, prefer using field filter variables. They offer "smart" filter widgets with dropdown menus and dynamic date pickers.

If your query lacks a database field for the filter to connect to, however, then you'll instead need to use a [basic variable](./basic-sql-parameters.md). For example, if you want to filter by a custom column you created, you'd need to use a basic variable.

## Field filter variables

To add a field filter:

1. [Add a variable to a `WHERE` clause](#field-filter-syntax).
2. [Connect the field filter to a database field](#connect-the-field-filter-to-a-database-field).
3. [Configure your filter widget](./sql-parameters.md#configure-your-filter-widget).

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

You can only map a field filter to a database field. If you can't use a field filter, you can fall back to using a [basic variable](./basic-sql-parameters.md).

## Specifying the table and field alias

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

## Field filters must be connected to database fields included in the query

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

If you can't use a field filter, you can instead fall back to using a [basic variable](./basic-sql-parameters.md).

## Field filters in BigQuery and Oracle

Make sure your SQL dialect matches the database you've selected. Common issues involving how tables are quoted in the query:

| Database | Dialect quirk                                       | Example                    |
| -------- | --------------------------------------------------- | -------------------------- |
| BigQuery | Schemas and tables must be quoted with backticks.   | `` FROM `dataset.table` `` |
| Oracle   | Schemas and tables must be quoted in double quotes. | `FROM "schema.table"`      |

For more help, see [Troubleshooting SQL error messages](../../troubleshooting-guide/error-message.md#sql-editor).

## Making a field filter optional

See [optional variables](./optional-variables.md).
