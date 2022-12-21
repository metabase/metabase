---
title: DatetimeAdd
---

# DatetimeAdd

`datetimeAdd` takes a datetime value and adds some unit of time to it. This function is useful when you're working with time series data that's marked by a "start" and an "end", such as sessions or subscriptions data.

| Syntax                                                                             | Example                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| `datetimeAdd(column, amount, unit)`                                                | `datetimeAdd("2021-03-25", 1, "month")` |
| Takes a timestamp or date value and adds the specified number of time units to it. | `2021-04-25`                            |

## Parameters

`column` can be any of:

- The name of a timestamp column,
- a custom expression that returns a [datetime](#accepted-data-types), or
- a string in the format `"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:MM:SS"`(as shown in the example above).

`unit` can be any of:

- "year"
- "quarter"
- "month"
- "day"
- "hour"
- "second"
- "millisecond"

`amount`:

- A whole number or a decimal number.
- May be a negative number: `datetimeAdd("2021-03-25", -1, "month")` will return `2021-04-25`.

## Calculating an end date

Let's say you're a coffee connoisseur, and you want to keep track of the freshness of your beans:

| Coffee                 | Opened On         | Finish By         |
| ---------------------- | ----------------- | ----------------- |
| DAK Honey Dude         | October 31, 2022  | November 14, 2022 |
| NO6 Full City Espresso | November 7, 2022  | November 21, 2022 |
| Ghost Roaster Giakanja | November 27, 2022 | December 11, 2022 |

Here, **Finish By** is a custom column with the expression:

```
datetimeAdd([Opened On], 14, 'day')
```

## Comparing a date to a window of time

To check if a specific datetime falls between your start and end datetimes, use [`between`](../expressions-list.md#between).

Unfortunately, Metabase doesn't currently support functions like `today`. If you want to check if today's date falls between **Opened On** and **Finish By** in the [Coffee example](#calculating-an-end-date):

1. Ask your database admin if there's table in your database that stores dates for reporting (sometimes called a date dimension table).
2. Create a new question using the date dimension table, with a filter for "Today".
3. Turn the "Today" question into a [model](../../../data-modeling/models.md).
4. Create a [left join](../../query-builder/join.md) between **Coffee** and the "Today" model on `[Opened On] <= [Today]` and `[Finish By] >= [Today]`.

The result should give you a **Today** column that's non-empty if today's date falls inside the coffee freshness window:

| Coffee                 | Opened On         | Finish By         | Today             |
| ---------------------- | ----------------- | ----------------- | ----------------- |
| DAK Honey Dude         | October 31, 2022  | November 14, 2022 | November 11, 2022 |
| NO6 Full City Espresso | November 7, 2022  | November 21, 2022 | November 11, 2022 |
| Ghost Roaster Giakanja | November 27, 2022 | December 11, 2022 |                   |

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `datetimeAdd` |
| ------------------------------------------------------------------------------------------------ | ------------------------ |
| String                                                                                           | ❌                       |
| Number                                                                                           | ❌                       |
| Timestamp                                                                                        | ✅                       |
| Boolean                                                                                          | ❌                       |
| JSON                                                                                             | ❌                       |

We use "timestamp" and "datetime" to talk about any temporal data type that's supported by Metabase.

If your timestamps are stored as strings or numbers in your database, an admin can [cast them to timestamps](../../../data-modeling/metadata-editing.md#casting-to-a-specific-data-type) from the Data Model page.

## Limitations

If you're using MongoDB, `datetimeAdd` will only work on versions 5 and up.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `datetimeAdd` expression, with notes on how to choose the best option for your use case.

**[Metabase expressions](../expressions-list.md)**

- [datetimeSubtract](#datetimesubtract)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### datetimeSubtract

`datetimeSubtract` and `datetimeAdd` are interchangeable, since you can use a negative number for `amount`. It's generally a good idea to avoid double negatives (such as subtracting a negative number).

```
datetimeSubtract([Opened On], -14, "day")
```

does the same thing as

```
datetimeAdd([Opened On], 14, "day")
```

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [coffee sample data](#calculating-an-end-date) is stored in a PostgreSQL database:

```sql
SELECT opened_on + INTERVAL '14 days' AS finish_by
FROM coffee
```

is equivalent to the Metabase `datetimeAdd` expression:

```
datetimeAdd([Opened On], 14, "day")
```

### Spreadsheets

If our [coffee sample data](#calculating-an-end-date) is in a spreadsheet where "Opened On" is in column A with a date format, the spreadsheet function

```
A:A + 14
```

produces the same result as

```
datetimeAdd([Opened On], 14, "day")
```

Most spreadsheet tools require use different functions for different time units (for example, you'd use a different function to add "months" to a date). `datetimeAdd` makes it easy for you to convert all of those functions to a single consistent syntax.

### Python

Assuming the [coffee sample data](#calculating-an-end-date) is in a `pandas` dataframe column called `df`, you can import the `datetime` module and use the `timedelta` function:

```
df['Finish By'] = df['Opened On'] + datetime.timedelta(days=14)
```

is equivalent to

```
datetimeAdd([Opened On], 14, "day")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
