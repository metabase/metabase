---
title: CountIf
---

# CountIf

`CountIf` counts the total rows (not unique rows) in a table that match a condition.

Syntax: `CountIf(condition)`.

Example: in the table below, `CountIf([Plan] = "Basic")` would return 3.

| ID  | Plan        |
|-----|-------------|
| 1   | Basic       |
| 2   | Basic       |
| 3   | Basic       |
| 4   | Business    |
| 5   | Premium     |

> [Aggregation formulas](../expressions-list.md#aggregations) like `CountIf` should be added to the query builder's [**Summarize** menu](../../query-builder/introduction.md#summarizing-and-grouping-by) > **Custom Expression** (scroll down in the menu if needed).

## Parameters

`condition` is a [function](../expressions-list.md#functions) or [conditional statement](../expressions.md#conditional-operators) that returns a boolean value (`true` or `false`).

## Multiple conditions

| ID  | Plan        | Active Subscription |
|-----|-------------| --------------------|
| 1   | Basic       | true                |
| 2   | Basic       | true                | 
| 3   | Basic       | false               |
| 4   | Business    | false               |
| 5   | Premium     | true                |

### Mandatory matches

To count the total rows in a table that match multiple mandatory conditions, combine the conditions using the `AND` operator:

```
CountIf(([Plan] = "Basic" AND [Active Subscription] = true))
```

This expression will return 2 on the sample data above (the total number of Basic plans that have an active subscription).

### Optional matches

To count the total rows in a table that match multiple optional conditions, combine the conditions using the `OR` operator:

```
CountIf(([Plan] = "Basic" OR [Active Subscription] = true))
```

Returns 4 on the sample data.

### Some mandatory and some optional matches

To combine mandatory and optional conditions, group the conditions using parentheses:

```
CountIf(([Plan] = "Basic" OR [Plan] = "Business") AND [Active Subscription] = "false"))
```

Returns 2 on the sample data.

> Tip: make it a habit to put parentheses around your `AND` and `OR` groups to avoid making mandatory conditions optional (or vice versa).

## Conditional count by group

In general, to get a conditional count for a category or group, such as the number of inactive subscriptions per plan, you'll:

1. Write a `CountIf` expression with your conditions.
2. Add a [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) column in the query builder.

Using the sample data:

| ID  | Plan        | Active Subscription |
|-----|-------------| --------------------|
| 1   | Basic       | true                |
| 2   | Basic       | true                | 
| 3   | Basic       | false               |
| 4   | Business    | false               |
| 5   | Premium     | true                |

Count the total number of inactive subscriptions per plan:

```
CountIf([Active Subscription] = false)
```

Alternatively, if your **Active Subscription** column contains `null` (empty) values that represent inactive plans, you could use:

```
{% raw %}CountIf([Payment], [Plan] != true){% endraw %}
```

> The "not equal" operator `!=` should be written as "!=".

To view your conditional counts by plan, set the **Group by** column to "Plan".

| Plan      | Total Inactive Subscriptions |
|-----------|------------------------------|
| Basic     | 1                            | 
| Business  | 1                            |
| Premium   | 0                            |

> Tip: when sharing your work with other people, it's helpful to use the `OR` filter, even though the `!=` filter is shorter. The inclusive `OR` filter makes it easier to understand which categories (e.g., plans) are included in your conditional count.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `CountIf`      |
| ------------------------------------------------------------------------------------------------ | ------------------------- |
| String                                                                                           | ❌                        |
| Number                                                                                           | ❌                        |
| Timestamp                                                                                        | ❌                        |
| Boolean                                                                                          | ✅                        |
| JSON                                                                                             | ❌                        |

Your `condition` must be an [function](../expressions-list.md#functions) or [conditional statement](../expressions.md#conditional-operators) that returns a boolean value (`true` or `false`).

## Related functions

**Metabase**
- [case](#case)
- [CumulativeCount](#cumulativecount)

**Other tools**
- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### case

You can combine [`Count`](../expressions-list.md#count) with [`case`](./case.md):

```
Count(case([Plan] = "Basic", [Plan]))
```

to do the same thing as the `CountIf` expression:

```
CountIf([Plan] = "Basic")
```

The `case` version lets you count a different column when the condition isn't met. For example, if you have data formatted like this:

| Active Plan | Expired Plan | Active Subscription |
|-------------|--------------| --------------------|
| Basic       |              | true                |
| Basic       |              | true                | 
|             | Basic        | false               |
|             | Business     | false               |
| Premium     |              | true                |

You could create a `case` expression to:

- count the "Active Plan" column when "Active Subscription = true"
- count the "Expired Plan" column when "Active Subscription = false"

```
Count(case([Active Subscription] = true, [Active Plan], [Expired Plan]))
```

### CumulativeCount

`CountIf` doesn't do running counts. You'll need to combine the [CumulativeCount](../expressions-list.md#cumulativecount) aggregation with the [`case`](./case.md) function.

If our sample data is a time series:

| ID  | Plan        | Active Subscription | Created Date     |
|-----|-------------| --------------------|------------------|
| 1   | Basic       | true                | October 1, 2020  |
| 2   | Basic       | true                | October 1, 2020  | 
| 3   | Basic       | false               | October 1, 2020  |
| 4   | Business    | false               | November 1, 2020 |
| 5   | Premium     | true                | November 1, 2020 |

And we want to get the running count of _active_ plans like this:

| Created Date: Month | Total Active Plans to Date |
|---------------------|----------------------------|
| October 2022        | 2                          |
| November 2022       | 3                          |

Create an aggregation from **Summarize** > **Custom expression**:

```
CumulativeCount(case([Active Subscription] = true, [Plan]))
```

You'll also need to set the **Group by** column to "Created Date: Month".

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [sample data](#multiple-conditions) is stored in a PostgreSQL database:

```sql
SELECT COUNT(CASE WHEN plan = "Basic" THEN id END) AS basic_plans
FROM accounts
```

is equivalent to the Metabase `CountIf` expression:

```
CountIf([Plan] = "Basic")
```

To add [conditions with a grouping column](#conditional-count-by-group):

```sql
SELECT 
    COUNT(CASE WHEN active_subscription = false THEN id END) AS total_inactive_subscriptions
FROM accounts
GROUP BY 
    plan
```

will do the same thing as the Metabase `CountIf` expression:

```
CountIf([Active Subscription] = false)
```

Note that the SQL `GROUP BY` statement will map to a Metabase [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) set to the "Plan" column.

### Spreadsheets

If our [sample data](#multiple-conditions) is in a spreadsheet where "ID" is in column A:

```
=CountIf(B:B, "Basic")
```

produces the same result as:

```
CountIf([Plan] = "Basic")
```

To add additional conditions, you'll need to use a spreadsheet **array formula**.

### Python

If our [sample data](#multiple-conditions) is in a `pandas` dataframe column called `df`:

```python
len(df[df['Plan'] == "Basic"])
```

will count the number of rows where the condition is met.

To get a [conditional count with a grouping column](#conditional-count-by-group):

```python
import datetime as dt

## Add your conditions

    df_filtered = df[df['Active subscription'] == false]

## Group by a column, and count the rows within each group

    len(df_filtered.groupby('Plan'))
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
