---
title: Basic SQL parameters
summary: Text, number, and date variables let you plug basic values into your SQL code.
---

# Basic SQL parameters

> If you want to filter on a database field in your query, you should prefer using [field filter variables](./sql-parameters.md), which require a different syntax.

To add a basic variable to a SQL query, enclose the variable in double braces: `{% raw %}{{variable_name}}{% endraw %}`.

This example defines a **Text** variable called `category`:

```sql
{% raw %}
SELECT
  count(*)
FROM
  products
WHERE
  category = {{category}}
{% endraw %}
```

These basic variables (that just allow basic string/number interpolation) have a different syntax than field filters.

Here's the [field filter](./sql-parameters.md#field-filter-variables) syntax:

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

## Basic SQL variables offer limited options for filter types

- **Text**: a plain input box
- **Number**: a plain input box
- **Date**: a simple date picker

If you want a more expressive filter widget, like a dynamic date picker, you should use a [field filter variable](./sql-parameters.md#field-filter-variables).
