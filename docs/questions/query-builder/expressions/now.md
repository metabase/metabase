---
title: Now
---

# Now

`now` returns the current date and time using your Metabase [report timezone](../configuring-metabase/settings#report-timezone).

| Syntax         | Example                     |
|----------------|-----------------------------|
|`now`           | November 22, 2022, 16:00:00 |

## Creating conditional logic using the current date or time

Let's say you have some project data, and you want to add a status column for each task. Assume today's date and time is November 22, 2022, 16:00:00.

| Task     | Start                       | Deadline                    | Status          |
|----------|-----------------------------|-----------------------------|-----------------|
| Draft    | November 1, 2022, 12:00:00  | November 30, 2022, 16:00:00 | In progress     |
| Review   | November 15, 2022, 16:00:00 | November 19, 2022, 16:00:00 | Needs extension |
| Edit     | November 22, 2022, 12:00:00 | November 22, 2022, 16:00:00 | DUE RIGHT NOW!  |

To mark a task in progress, you'd use the expression:

```
now >= [Start] AND now < [Deadline] 
```

To check if you need to ask for an extension:

```
now >= [Start] AND now >= [Deadline]
```

If you're looking for an adrenaline rush (and you have real-time data), you can flag the tasks that are due _right this second_:

```
now = [Deadline]
```

To set up the **Status** column that combines all three situations above, you'd wrap everything in a `case` expression:

```
case(now >= [Start] AND now < [Deadline], "In progress",
     now >= [Start] AND now >= [Deadline], "Needs extension",
     now = [Deadline], "DUE RIGHT NOW!")
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `now`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

This table uses `timestamp` and `datetime` interchangeably. If your dates and times are stored as strings or numbers in your database, you can [cast them to datetimes](../data-modeling/metadata-editing#casting-to-a-specific-data-type) from the Data Model page.

## Limitations

`now` might not actually be _now_ (in your local time) if you don't live in the same timezone as your Metabase [report timezone](../configuring-metabase/settings#report-timezone).

## Related functions

This section covers functions and formulas that work the same way as the Metabase `now` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

For example, the PostgreSQL function `CURRENT_TIMESTAMP()` gets the current date and time in your _database_ timezone. Database functions like `CURRENT_TIMESTAMP()` may give you different results from `now`, which uses your Metabase report timezone. 

### Spreadsheets

The spreadsheet function `NOW()` gets the current date and time in your operating system's timezone (the time that's on your computer or mobile device).

### Python

You can use `pd.datetime.now()` if you're using the `pandas` and `datetime` modules. This will give you the current date and time in your operating system's timezone.

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
