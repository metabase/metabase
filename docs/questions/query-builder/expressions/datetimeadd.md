---
title: DatetimeAdd
---

# DatetimeAdd

`datetimeAdd` takes a datetime value and adds some unit of time to it. This function is useful when you're working with time series data that's marked by a "start" and an "end", such as sessions or subscriptions data.

| Syntax                                                                              | Example                                              |
|-------------------------------------------------------------------------------------|------------------------------------------------------|
| `datetimeAdd(column, amount, unit)`                                                 | `datetimeAdd("March 25, 2021, 12:52:37", 1, "month")`|
| Takes a timestamp or date value and adds the specified number of time units to it.  | `April 25, 2021, 12:52:37`                           |

## Parameters

- Units can be any of: "year", "quarter", "month", "day", "hour", "second", or "millisecond".
- Amounts can be negative: `datetimeAdd("March 25, 2021, 12:52:37", -1, "month")` will return `February 25, 2021, 12:52:37`.

## Calculating an end date

Let's say you're a coffee connoisseur, and you want to keep track of the freshness of your beans:

| Coffee                 | Opened On  | Finish By  |
|------------------------|------------|------------|
| DAK Honey Dude         | 2022-10-31 | 2022-11-14 |
| NO6 Full City Espresso | 2022-11-07 | 2022-11-21 |
| Ghost Roaster Giakanja | 2022-11-27 | 2022-12-11 |

Here, **Finish By** is a custom column with the expression:

```
datetimeAdd([Opened On], 14, 'day')
```

You can use the [`between`](../expressions-list.md#between) or [`interval`](../expressions-list.md#interval) expressions to check if a given date falls between your start and end datetimes.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `datetimeAdd`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

This table uses `timestamp` and `datetime` interchangeably---just make sure that your dates and times aren't stored as string or a number data types in your database.

## Limitations

You can use `datetimeAdd` to _calculate_ relative dates given a column of date values, but unfortunately Metabase doesn't currently let you _generate_ a relative date (such as today's date).

For example, if you want to check if today's date falls between **Opened On** and **Finish By** in the [Coffee example](#calculating-an-end-date):

- Ask your database admin if there's table in your database that stores dates for reporting (sometimes called a date dimension table).
- Create a new question using the date dimension table, with a filter for "Today".
- Turn the "Today" question into a model.
- Create a left join between **Coffee** and the "Today" model on `[Opened On] <= [Today]` and `[Finish By] >= [Today]`.

The result should give you a **Today** column that's non-empty if today's date falls inside the coffee freshness window:

| Coffee                 | Opened On  | Finish By  | Today      | 
|------------------------|------------|------------|------------|
| DAK Honey Dude         | 2022-10-31 | 2022-11-14 | 2022-11-10 |
| NO6 Full City Espresso | 2022-11-07 | 2022-11-21 | 2022-11-10 |
| Ghost Roaster Giakanja | 2022-11-27 | 2022-12-11 |            |

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
datetimeAdd([Opened On], 14, 'day')
```

### SQL

When you run a question using the [query_builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [coffee sample data](#calculating-an-end-date) is stored in a PostgreSQL database:

```sql
SELECT opened_on + INTERVAL '14 days' AS finish_by
FROM coffee
```

is equivalent to the Metabase `datetimeAdd` expression:

```
datetimeAdd([Opened On], 14, 'day')
```

### Spreadsheets

If our [coffee sample data](#calculating-an-end-date) is in a spreadsheet where "Opened On" is in column A with a date format, the spreadsheet function

```
A:A + 14
```

produces the same result as

```
datetimeAdd([Opened On], 14, 'day')
```

Most spreadsheet tools require use different functions for different time units (for example, you'd use a different function to add "months" to a date). `datetimeAdd` makes it easy for you to convert all of those functions to a single consistent syntax.

### Python

Assuming the [coffee sample data](#calculating-an-end-date) is in a `pandas` dataframe column called `df`, you can import the `datetime` module and use the `timedelta` function:

```
df['Finish By'] = df['Opened On'] + datetime.timedelta(days=14)
```

is equivalent to

```
datetimeAdd([Opened On], 14, 'day')
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
