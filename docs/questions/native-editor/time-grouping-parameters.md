---
title: Time grouping parameter
---

# Time grouping parameter

You can add a parameter to SQL questions to change how results are grouped by time: by day, week, month, and so on.

To add a time grouping parameter, you'll need:

- An aggregation (like `COUNT`).
- A parameter in the `SELECT` clause
- That same parameter in the `GROUP BY` clause.

## Time grouping parameter example

Here's an example that counts the number of orders in the `orders` table and inserts a parameter to allow people to change how Metabase groups the results by the `created_at` column.

```sql
{% raw %}
SELECT
  COUNT(*) AS "Orders",
  {{created_at_param}} AS "Created At"
FROM
  orders
GROUP BY
  {{created_at_param}}
{% endraw %}
```

Like in all SQL groupings, you must include the parameter in both the `SELECT` and `GROUP BY` clauses. You can also group by multiple columns, like so:

```sql
{% raw %}
SELECT
  COUNT(*) AS "Count",
  {{created_at_param}} AS "Created at",
  {{trial_ends_at}} AS "Trial ends at"
FROM
  accounts
GROUP BY
  {{created_at_param}},
  {{trial_ends_at}}
{% endraw %}
```

Like with all parameters, you can set a default value (e.g., "month"). With time grouping parameters, you're limited to the options for the [time grouping parameter](../../dashboards/filters.md#time-grouping-parameter).

If people don't set a value for the parameter, Metabase won't group to a date part (like day or week). It will just group by untruncated dates.

## Handling aliases

Just like with field filters, if you alias a table, then map a time grouping parameter to a field in that aliased table, you'll need to [tell Metabase about the table and field alias](./field-filters.md#specifying-the-table-and-field-alias).

## Connecting to a dashboard filter

See [dashboard filters and parameters](../../dashboards/filters.md).
