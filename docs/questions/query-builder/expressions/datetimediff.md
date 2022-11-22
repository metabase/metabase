---
title: DatetimeDiff
---

# DatetimeDiff

`datetimeDiff` gets the amount of time between two datetime values, using the specified unit of time. Note that the difference is calculated in _whole_ units (see the example below).

| Syntax                                                                                                    | Example                                                                           |
|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| `datetimeDiff(datetime1, datetime2, unit)`                                                                | `datetimeDiff("February 1, 2021, 12:00:00", "March 15, 2021, 12:00:00", "month")` |
| Gets the difference between two datetimes (datetime2 minus datetime 1) using the specified unit of time.  | `1`                                                                               |

## Parameters

- Units can be any of: "year", "quarter", "month", "day", "hour", "second", or "millisecond".

## Calculating the age of an entity

Let's say you're a cheesemaker, and you want to keep track of your ripening process:

| Cheese            | Aging Start      | Aging End        |  Age in Months   |
|-------------------|------------------|------------------|------------------|
| Provolone         | January 19, 2022 | March 17, 2022   | 1                |
| Feta              | January 25, 2022 | May 3, 2022      | 3                |
| Monterey Jack     | January 27, 2022 | October 11, 2022 | 8                |

**Age in Months** is a custom column with the expression:

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

To calculate the _current_ age of a cheese, you use [`now`](../expressions/now.md) as the second datetime parameter, like this:

```
datetimeDiff([Aging Start], now, 'month')
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `datetimeDiff`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

This table uses `timestamp` and `datetime` interchangeably---just make sure that your dates and times aren't stored as strings or numbers in your database.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `datetimeDiff` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query_builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [cheese sample data](#calculating-an-end-date) is stored in a PostgreSQL database:

```sql
SELECT opened_on + INTERVAL '14 days' AS finish_by
FROM cheese
```

is equivalent to the Metabase `datetimeDiff` expression:

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

### Spreadsheets

If our [cheese sample data](#calculating-the-age-of-an-entity) is in a spreadsheet where "Aging Start" is in column B and "Aging End" is in column C:

```
DATEDIF(A22,B22,"M")
```

produces the same result as

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

### Python

Assuming the [cheese sample data](#calculating-the-age-of-an-entity) is in a `pandas` dataframe column called `df`, you can subtract the dates directly and use `numpy`'s `timedelta` to convert the difference to months:

```
df['Age in Months'] = (df['Aging End'] - df['Aging Start']) / np.timedelta(1, 'M')
```

is equivalent to

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
