---
title: DatetimeSubtract
---

# DatetimeSubtract

`datetimeSubtract` takes a datetime value and subtracts some unit of time from it. You might want to use this function when working with time series data that's marked by a "start" and an "end", such as sessions or subscriptions data.

| Syntax                                                                                    | Example                                      |
| ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| `datetimeSubtract(column, amount, unit)`                                                  | `datetimeSubtract("2021-03-25", 1, "month")` |
| Takes a timestamp or date value and subtracts the specified number of time units from it. | `2021-02-25`                                 |

## Parameters

`column` can be any of:

- The name of a timestamp column,
- a custom expression that returns a [datetime](#accepted-data-types), or
- a string in the format `"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:MM:SS"` (as shown in the example above).

`unit` can be any of:

- "year"
- "quarter"
- "month"
- "day"
- "hour"
- "minute"
- "second"
- "millisecond"

`amount`:

- An integer. You cannot use fractional values. For example, you cannot subtract "half a year" (0.5).
- May be a negative number: `datetimeSubtract("2021-03-25", -1, "month")` will return `2021-04-25`.

## Calculating a start date

Let's say you're planning a fun night out. You know it takes 30 minutes to get from place to place, and you need to figure out what time you have to leave to get to each of your reservations:

| Event   | Arrive By                  | Depart At                  |
| ------- | -------------------------- | -------------------------- |
| Drinks  | November 12, 2022 6:30 PM  | November 12, 2022 6:00 PM  |
| Dinner  | November 12, 2022 8:00 PM  | November 12, 2022 7:30 PM  |
| Dancing | November 13, 2022 12:00 AM | November 12, 2022 11:30 PM |

Here, **Depart At** is a custom column with the expression:

```
datetimeSubtract([Arrive By], 30, "minute")
```

## Checking if the current datetime is within an interval

Say you want to check if the current datetime falls between a [start date](#calculating-a-start-date) and an end date. Assume the "current" datetime is November 12, 7:45 PM.

| Event   | Arrive By                  | Depart At                  | On My Way |
| ------- | -------------------------- | -------------------------- | --------- |
| Drinks  | November 12, 2022 6:30 PM  | November 12, 2022 6:00 PM  | No        |
| Dinner  | November 12, 2022 8:00 PM  | November 12, 2022 7:30 PM  | Yes       |
| Dancing | November 13, 2022 12:00 AM | November 12, 2022 11:30 PM | No        |

**Depart At** is a custom column with the expression:

```
datetimeSubtract([Arrive By], 30, "minute")
```

**On My Way** uses [case](../expressions/case.md) to check if the current datetime ([now](../expressions/now.md)) is [between](../expressions-list.md#between) the datetimes in **Arrive By** and **Depart At**:

```
case(between(now, [Depart At], [Arrive By]), "Yes", "No")
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `datetimeSubtract` |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| String                                                                                                                         | ❌                            |
| Number                                                                                                                         | ❌                            |
| Timestamp                                                                                                                      | ✅                            |
| Boolean                                                                                                                        | ❌                            |
| JSON                                                                                                                           | ❌                            |

We use "timestamp" and "datetime" to talk about any temporal data type that's supported by Metabase. For more info about these data types in Metabase, see [Timezones](../../../configuring-metabase/timezones.md#data-types).

If your timestamps are stored as strings or numbers in your database, an admin can [cast them to timestamps](../../../data-modeling/metadata-editing.md#casting-to-a-specific-data-type) from the Table Metadata page.

## Limitations

If you're using MongoDB, `datetimeSubtract` will only work on versions 5 and up.

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

When you run a question using the [query builder](https://www.metabase.com/glossary/query-builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

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
- [Custom expressions tutorial](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/custom-expressions)
- [Time series analysis](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/time-series/start)
