---
title: DatetimeSubtract
---

# DatetimeSubtract

`datetimeSubtract` takes a datetime value and subtracts some unit of time from it. You might want to use this function when working with time series data that's marked by a "start" and an "end", such as sessions or subscriptions data.

| Syntax                                                                                    | Example                                                   |
|-------------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `datetimeSubtract(column, amount, unit)`                                                  | `datetimeSubtract("March 25, 2021, 12:52:37", 1, "month")`|
| Takes a timestamp or date value and subtracts the specified number of time units from it. | `February 25, 2021, 12:52:37`                             |

## Parameters

- Units can be any of: "year", "quarter", "month", "day", "hour", "second", or "millisecond".
- Amounts can be negative: `datetimeSubtract("March 25, 2021, 12:52:37", -1, "month")` will return `April 25, 2021, 12:52:37`.

## Calculating a start date

Let's say you're planning a fun night out. You know it takes 30 minutes to get from place to place, and you need to figure out what time you have to leave to get to each of your reservations:

| Event   | Arrive By           | Depart At           |
|---------|---------------------|---------------------|
| Drinks  | 2022-11-12 18:30:00 | 2022-11-12 18:00:00 |
| Dinner  | 2022-11-12 20:00:00 | 2022-11-12 19:30:00 |
| Dancing | 2022-11-13 00:00:00 | 2022-11-12 23:30:00 |

Here, **Depart At** is a custom column with the expression:

```
datetimeSubtract([Arrive By], 30, "minute")
```

You can use the [`between`](../expressions-list.md#between) or [`interval`](../expressions-list.md#interval) expressions to check if a given date falls between your start and end datetimes.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `datetimeSubtract`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

This table uses `timestamp` and `datetime` interchangeably---just make sure that your dates and times aren't stored as string or a number data types in your database.

## Limitations

You can use `datetimeSubtract` to calculate relative dates given a column of date values, but unfortunately Metabase doesn't currently let you _generate_ a relative date (such as today's date).

What if you want to check if today's date falls between **Arrive By** and **Depart At** in our [events example](#calculating-a-start-date)?

1. Ask your database admin if there's table in your database that stores datetimes for reporting (sometimes called a date dimension table).
2. Create a new question using the date dimension table, with a filter for "Today".
3. Turn the "Today" question into a model.
4. Create a left join between **Events** and the "Today" model on `[Arrive By] <= [Today]` and `[Depart At] >= [Today]`.

The result should give you an **Today** column that's non-empty for events that are happening while the night is still young:

| Event   | Arrive By           | Depart At           | Today               |
|---------|---------------------|---------------------|---------------------|
| Drinks  | 2022-11-12 18:30:00 | 2022-11-12 18:00:00 | 2022-11-12 00:00:00 |
| Dinner  | 2022-11-12 20:00:00 | 2022-11-12 19:30:00 | 2022-11-12 00:00:00 |
| Dancing | 2022-11-13 00:00:00 | 2022-11-12 23:30:00 |                     |

## Related functions

This section covers functions and formulas that work the same way as the Metabase `datetimeSubtract` expression, with notes on how to choose the best option for your use case.

**[Metabase expressions](../expressions-list.md)**

- [datetimeAdd](#datetimeadd)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### datetimeAdd

`datetimeSubtract` and `datetimeAdd` are interchangeable, since you can use a negative number for `amount`. We could use either expression for our [events example](#calculating-a-start-date), but you should try to avoid "double negatives" (such as subtracting a negative number).

```
datetimeAdd([Arrive By], -30, "minute")
```

does the same thing as

```
datetimeSubtract([Arrive By], 30, "minute")
```

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [events sample data](#calculating-a-start-date) is stored in a PostgreSQL database:

```sql
SELECT arrive_by - INTERVAL '30 minutes' AS depart_at
FROM events
```

is equivalent to the Metabase `datetimeSubtract` expression:

```
datetimeSubtract([Arrive By], 30, "minute")
```

### Spreadsheets 

Assuming the [events sample data](#calculating-a-start-date) is in a spreadsheet where "Arrive By" is in column A with a datetime format, the spreadsheet function

```
A:A - 30/(60*24)
```

produces the same result as

```
datetimeSubtract([Arrive By], 30, "minute")
```

Most spreadsheets require you to use different calculations for different time units (for example, you'd need to use a different calculation to subtract "days" from a date). `datetimeSubtract` makes it easy for you to convert all of those functions to a single consistent syntax.

### Python

If our [events sample data](#calculating-a-start-date) is in a `pandas` dataframe column called `df`, you can import the `datetime` module and use the `timedelta` function:

```
df['Depart At'] = df['Arrive By'] - datetime.timedelta(minutes=30)
```

is equivalent to

```
datetimeSubtract([Arrive By], 30, "minute")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)