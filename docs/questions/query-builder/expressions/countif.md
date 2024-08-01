---
title: CountIf
---

# CountIf

`CountIf` counts the total number of rows in a table that match a condition. `CountIf` counts every row, not just unique rows.

Syntax: `CountIf(condition)`.

Example: in the table below, `CountIf([Plan] = "Basic")` would return 3.

| ID  | Plan        |
|-----|-------------|
| 1   | Basic       |
| 2   | Basic       |
| 3   | Basic       |
| 4   | Business    |
| 5   | Premium     |

> [Aggregations](../expressions-list.md#aggregations) like `CountIf` should be added to the query builder's [**Summarize** menu](../../query-builder/introduction.md#summarizing-and-grouping-by) > **Custom Expression** (scroll down in the menu if needed).

## Parameters

`CountIf` accepts a [function](../expressions-list.md#functions) or [conditional statement](../expressions.md#conditional-operators) that returns a boolean value (`true` or `false`).

## Multiple conditions

We'll use the following sample data to show you `CountIf` with [required](#required-conditions), [optional](#optional-conditions), and [mixed](#some-required-and-some-optional-conditions) conditions.

| ID  | Plan        | Active Subscription |
|-----|-------------| --------------------|
| 1   | Basic       | true                |
| 2   | Basic       | true                |
| 3   | Basic       | false               |
| 4   | Business    | false               |
| 5   | Premium     | true                |

### Required conditions

To count the total number of rows in a table that match multiple required conditions, combine the conditions using the `AND` operator:

```
CountIf(([Plan] = "Basic" AND [Active Subscription] = true))
```

This expression will return 2 on the sample data above (the total number of Basic plans that have an active subscription).

### Optional conditions

To count the total rows in a table that match multiple optional conditions, combine the conditions using the `OR` operator:

```
CountIf(([Plan] = "Basic" OR [Active Subscription] = true))
```

Returns 4 on the sample data: there are three Basic plans, plus one Premium plan has an active subscription.

### Some required and some optional conditions

To combine required and optional conditions, group the conditions using parentheses:

```
CountIf(([Plan] = "Basic" OR [Plan] = "Business") AND [Active Subscription] = "false")
```

Returns 2 on the sample data: there are only two Basic or Business plans that lack an active subscription.

> Tip: make it a habit to put parentheses around your `AND` and `OR` groups to avoid making required conditions optional (or vice versa).

## Conditional counts by group

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
CountIf([Payment], [Plan] != true)
```

> The "not equal" operator `!=` should be written as !=.

To view your conditional counts by plan, set the **Group by** column to "Plan".

| Plan      | Total Inactive Subscriptions |
|-----------|------------------------------|
| Basic     | 1                            |
| Business  | 1                            |
| Premium   | 0                            |

> Tip: when sharing your work with other people, it's helpful to use the `OR` filter, even though the `!=` filter is shorter. The inclusive `OR` filter makes it easier to understand which categories (e.g., plans) are included in your conditional count.

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `CountIf`      |
| ------------------------------------------------------------------------------------------------ | ------------------------- |
| String                                                                                           | ❌                        |
| Number                                                                                           | ❌                        |
| Timestamp                                                                                        | ❌                        |
| Boolean                                                                                          | ✅                        |
| JSON                                                                                             | ❌                        |

`CountIf` accepts a [function](../expressions-list.md#functions) or [conditional statement](../expressions.md#conditional-operators) that returns a boolean value (`true` or `false`).

## Related functions

Different ways to do the same thing, because it's fun to try new things.

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
Count(case([Plan] = "Basic", [ID]))
```

to do the same thing as `CountIf`:

```
CountIf([Plan] = "Basic")
```

The `case` version lets you count a different column when the condition isn't met. For example, if you've got data from different sources:

| ID: Source A  | Plan: Source A | ID: Source B  | Plan: Source B       |
|---------------|----------------|---------------| ---------------------|
| 1             | Basic          |               |                      |
|               |                | B             | basic                |
|               |                | C             | basic                |
| 4             | Business       | D             | business             |
| 5             | Premium        | E             | premium              |

To count the total number of Basic plans across both sources, you could create a `case` expression to:

- Count the rows in "ID: Source A" where "Plan: Source A = "Basic"
- Count the rows in "ID: Source B" where "Plan: Source B = "basic"

```
Count(case([Plan: Source A] = "Basic", [ID: Source A],
            case([Plan: Source B] = "basic", [ID: Source B])))
```

### CumulativeCount

`CountIf` doesn't do running counts. You'll need to combine [CumulativeCount](../expressions-list.md#cumulativecount) with [`case`](./case.md).

If our sample data is a time series:

| ID  | Plan        | Active Subscription | Created Date     |
|-----|-------------| --------------------|------------------|
| 1   | Basic       | true                | October 1, 2020  |
| 2   | Basic       | true                | October 1, 2020  |
| 3   | Basic       | false               | October 1, 2020  |
| 4   | Business    | false               | November 1, 2020 |
| 5   | Premium     | true                | November 1, 2020 |

And we want to get the running count of active plans like this:

| Created Date: Month | Total Active Plans to Date |
|---------------------|----------------------------|
| October 2020        | 2                          |
| November 2020       | 3                          |

Create an aggregation from **Summarize** > **Custom expression**:

```
CumulativeCount(case([Active Subscription] = true, [ID]))
```

You'll also need to set the **Group by** column to "Created Date: Month".

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your query builder settings (filters, summaries, etc.) into a SQL query, and run that query against your database to get your results.

If our [sample data](#multiple-conditions) is stored in a PostgreSQL database, the SQL query:

```sql
SELECT COUNT(CASE WHEN plan = "Basic" THEN id END) AS total_basic_plans
FROM accounts
```

is equivalent to the Metabase expression:

```
CountIf([Plan] = "Basic")
```

If you want to get [conditional counts broken out by group](#conditional-counts-by-group), the SQL query:

```sql
SELECT
    plan,
    COUNT(CASE WHEN active_subscription = false THEN id END) AS total_inactive_subscriptions
FROM accounts
GROUP BY
    plan
```

The `SELECT` part of the SQl query matches the Metabase expression:

```
CountIf([Active Subscription] = false)
```

The `GROUP BY` part of the SQL query matches a Metabase [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) set to the "Plan" column.

### Spreadsheets

If our [sample data](#multiple-conditions) is in a spreadsheet where "ID" is in column A, the spreadsheet formula:

```
=CountIf(B:B, "Basic")
```

produces the same result as the Metabase expression:

```
CountIf([Plan] = "Basic")
```

### Python

If our [sample data](#multiple-conditions) is in a `pandas` dataframe column called `df`, the Python code:

```python
len(df[df['Plan'] == "Basic"])
```

uses the same logic as the Metabase expression:

```
CountIf([Plan] = "Basic")
```

To get a [conditional count with a grouping column](#conditional-counts-by-group):

```python
## Add your conditions

    df_filtered = df[df['Active subscription'] == false]

## Group by a column, and count the rows within each group

    len(df_filtered.groupby('Plan'))
```

The Python code above will produce the same result as the Metabase `CountIf` expression (with the [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) column set to "Plan").

```
CountIf([Active Subscription] = false)
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
