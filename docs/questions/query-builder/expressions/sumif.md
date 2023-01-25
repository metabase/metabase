---
title: SumIf
---

# SumIf

`SumIf` adds up the values in a column based on a condition.

Syntax: `SumIf(column, condition)`.

Example: in the table below, `SumIf([Payment], [Plan] = "Basic")` would return 200.

| Payment  | Plan        |
|----------|-------------|
| 100      | Basic       |
| 100      | Basic       |
| 200      | Business    |
| 200      | Business    |
| 400      | Premium     |

> [Aggregation formulas](../expressions-list.md#aggregations) like `sumif` should be added to the query builder's [**Summarize** menu](../../query-builder/introduction.md#summarizing-and-grouping-by) > **Custom Expression** (scroll down in the menu if needed).

## Parameters

- `column` can be the name of a numeric column, or an expression that returns a numeric column.
- `condition` is an expression that returns a boolean value (`true` or `false`), like the expression `[Payment] > 100`.

## Multiple conditions

| Payment  | Plan        | Date Received     |
|----------|-------------| ------------------|
| 100      | Basic       | October 1, 2020   |
| 100      | Basic       | October 1, 2020   | 
| 200      | Business    | October 1, 2020   |
| 200      | Business    | November 1, 2020  |
| 400      | Premium     | November 1, 2020  |

To sum a column based on multiple _mandatory_ conditions, combine the conditions using the `AND` operator:

```
SumIf([Payment], ([Plan] = "Basic" AND month([Date Received]) = 10))
```

This expression would return 200 on the sample data above, as it sums all of the payments received for Basic Plans in October.

To sum a column with multiple _optional_ conditions, combine the conditions using the `OR` operator:

```
SumIf([Payment], ([Plan] = "Basic" OR [Plan] = "Business"))
```

Returns 600 on the sample data.

To combine mandatory and optional conditions, group the conditions using parentheses:

```
SumIf([Payment], ([Plan] = "Basic" OR [Plan] = "Business") AND month([Date Received]) = 10)
```

Returns 400 on the sample data.

> Tip: make it a habit to put parentheses around your `AND` and `OR` groups to avoid making mandatory conditions optional (or vice versa).

## Conditional subtotals by group

To get a conditional subtotal for a category or group, such as the total payments per plan, you'll:

1. Write a `sumif` formula with your conditions.
2. Add a [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) column in the query builder.

| Payment  | Plan        | Date Received     |
|----------|-------------| ------------------|
| 100      | Basic       | October 1, 2020   |
| 100      | Basic       | October 1, 2020   | 
| 200      | Business    | October 1, 2020   |
| 200      | Business    | November 1, 2020  |
| 400      | Premium     | November 1, 2020  |

To sum payments for the Business and Premium plans:

```
SumIf([Payment], [Plan] = "Business" OR [Plan] = "Premium")
```

Or, sum payments for all plans that aren't "Basic": 

```
{% raw %}SumIf([Payment], [Plan] != "Basic"){% endraw %} 
```

> The "not equal" operator `!=` should be written as "!=".

To view those payments by month, set the **Group by** column to "Date Received: Month".

| Date Received: Month | Total Payments for Business and Premium Plans |
|----------------------|-----------------------------------------------|
| October              | 200                                           | 
| November             | 600                                           |

> Tip: when sharing your work with other people, it's helpful to use the `OR` filter, even though the `!=` filter is shorter. The inclusive `OR` filter makes it easier to understand which categories (e.g., plans) are included in the sum.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `SumIf`        |
| ------------------------------------------------------------------------------------------------ | ------------------------- |
| String                                                                                           | ❌                        |
| Number                                                                                           | ✅                        |
| Timestamp                                                                                        | ❌                        |
| Boolean                                                                                          | ❌                        |
| JSON                                                                                             | ❌                        |

## Related functions

**Metabase**
- [case](#case)
- [CumulativeSum](#cumulativesum)

**Other tools**
- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### case

You can combine the `Sum` and [`case`](./case.md) formulas

```
Sum(case([Plan] = "Basic", [Payment]))
```

to do the same thing as the `SumIf` formula:

```
SumIf([Payment], [Plan] = "Basic")
```

The `case` version lets you sum a different column when the condition isn't met. For example, you could create a column called "Revenue" that:

- sums the "Payments" column when "Plan = Basic", and
- sums the "Contract" column otherwise.

```
sum(case([Plan] = "Basic", [Payment], [Contract]))
```

### CumulativeSum

`SumIf` doesn't do running totals. You'll need to combine the [CumulativeSum](../expressions-list.md#cumulativesum) aggregation with the [`case`](./case.md) formula.

For example, to get the running total of payments for the Business and Premium plans by month (using our [payment sample data](#conditional-subtotals-by-group)):

| Date Received: Month | Total Payments for Business and Premium Plans |
|----------------------|-----------------------------------------------|
| October              | 200                                           | 
| November             | 800                                           |

Create an aggregation from **Summarize** > **Custom expression**:

```
CumulativeSum(case(([Plan] = "Basic" OR [Plan] = "Premium"), [Payment], 0))
```

Don't forget to set the **Group by** column to "Date Received: Month".

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [payment sample data](#sumif) is stored in a PostgreSQL database:

```sql
SELECT 
    SUM(CASE WHEN plan = "Basic" THEN payment ELSE 0 END) AS total_payments_basic
FROM invoices
```

is equivalent to the Metabase `SumIf` expression:

```
SumIf([Payment], [Plan] = "Basic")
```

To add [multiple conditions with a grouping column](#conditional-subtotals-by-group):

```sql
SELECT 
    DATE_TRUNC("month", date_received)                       AS date_received_month,
    SUM(CASE WHEN plan = "Business" THEN payment ELSE 0 END) AS total_payments_business_or_premium
FROM invoices
GROUP BY 
    DATE_TRUNC("month", date_received)
```

The SQL `SELECT` statement matches the Metabase `SumIf` expression:

```
SumIf([Payment], [Plan] = "Business" OR [Plan] = "Premium")
```

The SQL `GROUP BY` statement maps to a Metabase [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) column set to "Date Received: Month".

### Spreadsheets

If our [payment sample data](#sumif) is in a spreadsheet where "Payment" is in column A and "Date Received" is in column B:

```
=SUMIF(B:B, "Basic", A:A)
```

produces the same result as:

```
SumIf([Payment], [Plan] = "Basic")
```

To add additional conditions, you'll need to switch to a spreadsheet **array formula**.

### Python

If our [payment sample data](#sumif) is in a `pandas` dataframe column called `df`:

```python
df.loc[df['Plan'] == "Basic", 'Payment'].sum()
```

is equivalent to

```
SumIf([Payment], [Plan] = "Basic")
```

To add [multiple conditions with a grouping column](#conditional-subtotals-by-group):

```python
import datetime as dt

## Optional: convert the column to a datetime object

    df['Date Received'] = pd.to_datetime(df['Date Received'])

## Extract the month and year

    df['Date Received: Month'] = df['Date Received'].dt.to_period('M')

## Add your conditions

    df_filtered = df[(df['Plan'] == 'Business') | (df['Plan'] == 'Premium')]

## Sum and group by

    df_filtered.groupby('Date Received: Month')['Payment'].sum()
```

These steps will produce the same result as the Metabase `SumIf` expression (with the [**Group by**](../../query-builder/introduction.md#summarizing-and-grouping-by) column set to "Date Received: Month").

```
SumIf([Payment], [Plan] = "Business" OR [Plan] = "Premium")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
