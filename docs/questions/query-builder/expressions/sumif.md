---
title: SumIf
---

# SumIf

`SumIf` adds the values in a column based on the values in another column.

Syntax: `SumIf(column, condition)`.

Example: in the table below, `SumIf([Payment], [Plan] = "Basic")` would return 200.

| Payment  | Plan        |
|----------|-------------|
| 100      | Basic       |
| 100      | Basic       |
| 200      | Business    |
| 200      | Business    |
| 400      | Premium     |

## Parameters

- `column` can be the name of a numeric column, or an expression that returns a numeric column.
- `condition` is an expression that returns `true` or `false`.

## Multiple conditions

| Payment  | Plan        | Date Received     |
|----------|-------------| ------------------|
| 100      | Basic       | October 1, 2020   |
| 100      | Basic       | October 1, 2020   | 
| 200      | Business    | October 1, 2020   |
| 200      | Business    | November 1, 2020  |
| 400      | Premium     | November 1, 2020  |

Use `AND` to set multiple _mandatory_ conditions:

```
SumIf([Payment], [Plan] = "Basic" AND month([Date Received]) = 10)
```

returns 200.

Use `OR` to set multiple _optional_ conditions:

```
SumIf([Payment], ([Plan] = "Basic" OR [Plan] = "Business"))
```

returns 600.

To combine mandatory and optional conditions:

```
SumIf([Payment], ([Plan] = "Basic" OR [Plan] = "Business") AND month([Date Received]) = 10)
```

returns 400.

> Tip: make it a habit to put brackets around your `OR` statements to avoid mixing up your mandatory and optional conditions.

## Conditional subtotal

To get a subtotal for a group, you need to add a [**Group by** column](../questions/query-builder/introduction.md#summarizing-and-grouping-by).

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

To view those payments by month, set the **Group by** column to **Date Received: Month**:

| Date Received: Month | Total Payments for Business and Premium Plans |
|----------------------|-----------------------------------------------|
| October              | 200                                           | 
| November             | 600                                           |

> Tip: In this example, you could also use `SumIf([Payment], [Plan] != "Basic")` to get the Business and Premium plans. But if you're sharing these formulas with other people, it's better to use the `OR` version, since people can see what's explicitly being included (in case there are more plan names that aren't obvious).

## Limitations

`SumIf` doesn't do cumulative totals like this:

| Date Received: Month | Cumulative Payments for Business and Premium Plans |
|----------------------|----------------------------------------------------|
| October              | 200                                                | 
| November             | 800                                                |

You'll need to combine the [CumulativeSum](../expressions-list.md#cumulativesum) aggregation with the `case` formula instead.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `SumIf`        |
| ------------------------------------------------------------------------------------------------ | ------------------------- |
| String                                                                                           | ❌                        |
| Number                                                                                           | ✅                        |
| Timestamp                                                                                        | ❌                        |
| Boolean                                                                                          | ❌                        |
| JSON                                                                                             | ❌                        |

## Related functions

This section covers functions and formulas that work the same way as the Metabase `SumIf` expression, with notes on how to choose the best option for your use case.

**Metabase**
- [case](#case)

**Other tools**
- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### case

You can combine the `sum` and [`case`](./case.md) formulas

```
sum(case([Plan] = "Basic", [Payment]))
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

To add [multiple conditions with a grouping column](#conditional-subtotal):

```sql
SELECT 
    DATE_TRUNC("month", date_received)                       AS date_received_month,
    SUM(CASE WHEN plan = "Business" THEN payment ELSE 0 END) AS total_payments_business_or_premium
FROM invoices
GROUP BY 
    DATE_TRUNC("month", date_received)
```

The `SELECT` statement matches the Metabase `SumIf` expression

```
SumIf([Payment], [Plan] = "Business" OR [Plan] = "Premium")
```

The `GROUP BY` statement maps to a Metabase **Group by** column set to "Date Received: Month".

### Spreadsheets

If our [payment sample data](#sumif) is in a spreadsheet where "Payment" is in column A and "Date Received" is in column B:

```
=SUMIF(B:B, "Basic", A:A)
```

produces the same result as

```
SumIf([Payment], [Plan] = "Basic")
```

To add additional conditions, you'll need to switch to use a spreadsheet **array formula**.

### Python

If our [payment sample data](#sumif) is in a `pandas` dataframe column called `df`:

```python
df['Total Payments: Basic'] = df.loc[df['Plan'] == "Basic", 'Payments'].sum()
```

is equivalent to

```
SumIf([Payment], [Plan] = "Basic")
```

To add [multiple conditions with a grouping column](#conditional-subtotal):

```python
import datetime as dt

## Add a column that extracts the month and year
df['Date Received: Month'] = df['Date Received'].dt.to_period('M')

## Get a dataframe that's filtered to Plan = "Business" OR Plan = "Premium"
df_filtered = df[(df['Plan'] == 'Business') | (df['Plan'] == 'Premium')]

## Sum the Payment column in the filtered dataframe and
## group by the Date Received: Month
df_filtered.groupby('Date Received: Month')['Payment'].sum()
```

This will produce the same result as the Metabase `SumIf` expression (with the **Group by** column set to "Date Received: Month").

```
SumIf([Payment], [Plan] = "Business" OR [Plan] = "Premium")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
