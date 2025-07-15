---
title: Time grouping parameter
---

# Time grouping parameter

You can add a parameter to SQL questions to change how results are grouped by time: by day, week, month, and so on.

To make this work, you'll need to add parameters in both the `SELECT` and `GROUP BY` clauses.

## Time grouping parameter example

Here's an example that counts the number of orders in the `orders` table and inserts a parameter to allow people to change how Metabase groups the results by the `created_at` column.

```sql
{% raw %}
SELECT
  COUNT(*) AS "Orders",
  {{mb.time_grouping("Time grouping", "created_at")}} AS "Created At"
FROM
  orders
GROUP BY
  {{mb.time_grouping("Time grouping", "created_at")}}
{% endraw %}
```

Like in all SQL groupings, you must include the parameter in both the `SELECT` and `GROUP BY` clauses. You can also use the `mb.time_grouping` function on different columns in the same query, like this:

```sql
SELECT
  COUNT(*) AS "Orders",
  {{mb.time_grouping("Time grouping", "created_at")}} AS "Created At",
  {{mb.time_grouping("Trial ends at", "trial_ends_at")}} AS "Trial ends at"
FROM
  accounts
GROUP BY
  {{mb.time_grouping("Time grouping", "created_at")}},
  {{mb.time_grouping("Trial ends at", "trial_ends_at")}}
```

## Time grouping parameter syntax

To include a time grouping parameter, include an `mb.time_grouping` function call:

```sql
{% raw %}{{mb.time_grouping(name, column)}}{% endraw %}
```

- `mb.time_grouping` is the function that handles the time grouping. It takes two arguments: `name` and `column`.
- `name` is what you want to call the parameter. The name can be anything, but it must be wrapped in either single or double quote marks. E.g., `"Unit"` or `'Time Grouping'`. By default, this name will change the label on the widget. You can also set a different label for the widget in the variables sidebar.
- `column` is the name of the column you want to group by. The column name must be wrapped in either single or double quote marks, e.g., `"created_at"` (`created_at` without the quotes won't work).

Like with all parameters, you can set a default value (e.g., "month"). With time grouping parameters, you're limited to the options for the [time grouping parameter](../../dashboards/filters.md#time-grouping-parameter).

If people don't set a value for the parameter, Metabase won't group to a date part (like day or week). It will just group by untruncated dates.

## Connecting to a dashboard filter

See [dashboard filters and parameters](../../dashboards/filters.md).
