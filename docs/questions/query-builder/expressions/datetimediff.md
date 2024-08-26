---
title: DatetimeDiff
---

# DatetimeDiff

`datetimeDiff` gets the amount of time between two datetime values, using the specified unit of time. Note that the difference is calculated in _whole_ units (see the example below).

| Syntax                                                                                                   | Example                                             |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `datetimeDiff(datetime1, datetime2, unit)`                                                               | `datetimeDiff("2022-02-01", "2022-03-01", "month")` |
| Gets the difference between two datetimes (datetime2 minus datetime 1) using the specified unit of time. | `1`                                                 |

## Parameters

`datetime1` and `datetime2` can be:

- The name of a timestamp column,
- a custom expression that returns a [datetime](#accepted-data-types), or
- a string in the format `"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:MM:SS"` (as shown in the example above).

`unit` can be any of:

- "year"
- "quarter"
- "month"
- "week"
- "day"
- "hour"
- "minute"
- "second"

## Calculating age

Let's say you're a cheesemaker, and you want to keep track of your ripening process:

| Cheese        | Aging Start      | Aging End        | Mature Age (Months) |
| ------------- | ---------------- | ---------------- | ------------------- |
| Provolone     | January 19, 2022 | March 17, 2022   | 1                   |
| Feta          | January 25, 2022 | May 3, 2022      | 3                   |
| Monterey Jack | January 27, 2022 | October 11, 2022 | 8                   |

**Mature Age (Months)** is a custom column with the expression:

```
datetimeDiff([Aging Start], [Aging End], "month")
```

To calculate the _current_ age of a cheese in months, you use [`now`](../expressions/now.md) as the second datetime parameter, like this:

```
datetimeDiff([Aging Start], now, "month")
```

To calculate the current age of a cheese in days, you'd use:

```
datetimeDiff([Aging Start], now, "day")
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `datetimeDiff` |
| ------------------------------------------------------------------------------------------------ | ------------------------- |
| String                                                                                           | ❌                        |
| Number                                                                                           | ❌                        |
| Timestamp                                                                                        | ✅                        |
| Boolean                                                                                          | ❌                        |
| JSON                                                                                             | ❌                        |

We use "timestamp" and "datetime" to talk about any temporal data type that's supported by Metabase. For more info about these data types in Metabase, see [Timezones](../../../configuring-metabase/timezones.md#data-types).

If your timestamps are stored as strings or numbers in your database, an admin can [cast them to timestamps](../../../data-modeling/metadata-editing.md#casting-to-a-specific-data-type) from the Table Metadata page.

## Limitations

`datetimeDiff` is currently unavailable for the following databases:

- Druid

## Related functions

This section covers functions and formulas that work the same way as the Metabase `datetimeDiff` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [cheese sample data](#calculating-age) is stored in a PostgreSQL database:

```sql
SELECT DATE_PART('month', AGE(aging_end, aging_start)) AS mature_age_months
FROM cheese
```

is equivalent to the Metabase `datetimeDiff` expression:

```
datetimeDiff([Aging Start], [Aging End], "month")
```

Some databases, such as Snowflake and BigQuery, support functions like `DATEDIFF` or `DATE_DIFF`. For more info, check out our list of [common SQL reference guides](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-syntax#common-sql-reference-guides).

### Spreadsheets

If our [cheese sample data](#calculating-age) is in a spreadsheet where "Aging Start" is in column B and "Aging End" is in column C:

```
DATEDIF(B1, C1, "M")
```

produces the same result as

```
datetimeDiff([Aging Start], [Aging End], "month")
```

Yes, `DATEDIF` looks a bit wrong, but the spreadsheet function really is `DATEDIF()` with one "f", not `DATEDIFF()`.

### Python

Assuming the [cheese sample data](#calculating-age) is in a `pandas` dataframe column called `df`, you can subtract the dates directly and use `numpy`'s `timedelta64` to convert the difference to months:

```
df['Mature Age (Months)'] = (df['Aging End'] - df['Aging Start']) / np.timedelta64(1, 'M')
```

is equivalent to

```
datetimeDiff([Aging Start], [Aging End], "month")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series analysis](https://www.metabase.com/learn/time-series/start)
