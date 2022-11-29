---
title: ConvertTimezone
---

# ConvertTimezone

`convertTimezone` shifts a datetime into a specified time zone by adding or subtracting the right number of hours from the datetime.

Time zones are rather nasty to work with (it's easy to make mistakes, and difficult to catch them), so you should only try to use `convertTimezone` if the interpretation of your data is very sensitive to time-based cutoffs.

For example, if you're tracking user logins over time, you probably won't run your business differently if some logins get counted on Mondays instead of Tuesdays. However, if you're using Metabase to do something precise, like your taxes, you (and the government) will probably care a lot more about the difference between transactions that occurred on Dec 31 vs. Jan 1.

| Syntax                                                               | Example                                                       |
|----------------------------------------------------------------------|---------------------------------------------------------------|
| `convertTimezone(column, target, source)`                            | `convertTimezone("December 28, 2022, 12:00:00", "EST, "PST")` |
| Shifts a datetime from the source time zone to the target time zone. | `December 28, 2022, 9:00:00`                                  |

## Parameters

- `target` is the time zone you want to assign to your column.
- The name of the `target` time zone depends on your database. For example, you may have to use "Canada/Eastern" instead of "EST".
- `source` is only a required parameter if you have timestamps without time zones in your database. See [Limitations](#limitations) for more info.

## Creating custom report dates

Let's say that you have some time series data that's stored in one or more time zones (**Source Time**). You want to create custom reporting dates for a team that lives in EST. We recommend labeling `convertTimezone` columns with the name of the target time zone (or adding the time zone to the metadata of a model).

| Source Time                        | Team Report Time (EST)       |
|------------------------------------|------------------------------|
| December 28, 2022, 10:00:00        | December 28, 2022, 07:00:00  |
| December 28, 2022, 21:00:00        | December 28, 2022, 19:00:00  |
| December 27, 2022, 08:00:00        | December 27, 2022, 05:00:00  |

If you're unsure about the time zone for **Source Time**, you should use two `convertTimezone` expressions to create **Team Report Time (EST)** :

```
convertTimezone(convertTimezone([Source Time], 'UTC'), 'EST', 'UTC')
```

- The inner `convertTimezone` converts your column to UTC (basically, you're setting your own "source" time zone).
- The outer `convertTimezone` converts the UTC output to your actual target time zone (EST).
- You must provide the `source` parameter in the outer expression (because the output of the inner `convertTimezone` expression is a timestamp without time zone metadata).

You should only write something like `convertTimezone([Source Time], 'EST')` if you're certain that:

- **Source Time** is stored _with_ time zone metadata in your database, and
- your Metabase displays datetimes or timestamps in your database's time zone.

See [Limitations](#limitations) if you're interested in more gory details.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `convertTimezone`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

This table uses `timestamp` and `datetime` interchangeably. If your dates and times are stored as strings or numbers in your database, you can [cast them to datetimes](../data-modeling/metadata-editing#casting-to-a-specific-data-type) from the Data Model page.

## Limitations

Before you do time zone conversions, make sure you know the source time zone that you're working with. Different columns (and even different rows) in the same table, question, or model can be in different "source" time zones.

| Possible source time zone     | Description                                                         | Example                                                                                                          |
|-------------------------------|---------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Client time zone              | Time zone where an event happened.                                  | A web analytics service might capture data in the local time zone of each person who visited your website.       |
| Database time zone            | Time zone metadata that's been added to datetimes in your database. | It's a common database practice to store all datetimes in UTC.                                                   |
| No time zone                  | Missing time zone metadata                                          | Databases don't _require_ you to store datetimes with time zone metadata.                                        |
| Metabase report time zone     | Time zone that Metabase uses to _display_ datetimes.                | Metabase can display dates and times in PST, even if the dates and times are stored as UTC in your database.     |

For example, say you have a table with one row for each person who visited your website. It's hard to tell, just from looking at `December 28, 2022, 12:00:00`, whether it's:

- stored using your database's time zone (usually UTC),
- stored without time zone metadata (for example, if the website visitor is in HKT, then the datetime `December 28, 2022, 12:00:00` might "implicitly" use Hong Kong time),
- _displayed_ in your Metabase report time zone.

The Metabase report time zone will only change the display of datetimes stored _with_ time zone metadata in your database. If you convert a datetime using `convertTimezone`, the result will be displayed in your `target` time zone, not the Metabase report time zone.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `convertTimezone` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [datetime sample data](#creating-custom-report-dates) is stored in a PostgreSQL database (Postgres databases have [no time zone metadata](#limitations)):

```sql
SELECT (source_time::TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'EST' AS team_report_time_est
```

is equivalent to the Metabase `convertTimezone` expression:

```
convertTimezone(convertTimezone([Source Time], 'UTC'), 'EST', 'UTC')
```

If `source_time` is stored _with_ time zone metadata, for example in a Snowflake database with time zone UTC:

```sql
SELECT convert_timezone('America/Toronto', source_time) AS team_report_time_est
```

is equivalent to the Metabase `convertTimezone` expression:

```
convertTimezone([Source Time], 'EST')
```

Remember that the time zone names depend on your database. For example, Snowflake doesn't accept most time zone abbreviations (like EST).

### Spreadsheets

If our [datetime sample data](#creating-custom-report-dates) is in a spreadsheet where "Source Time" is in column A, we can change it to EST by subtracting the hours explicitly:

```
A1 - TIME(5, 0, 0)
```

to get the same result as

```
convertTimezone([Client Time], 'EST')
```

### Python

If the [datetime sample data](#creating-custom-report-dates) is stored in a `pandas` dataframe, you could convert the **Source Time** column to a `datetime` object with time zone UTC first, then use `tz_convert` to change the time zone to EST:

```
df['Source Time (UTC)'] = pd.to_datetime(df['Source Time'], utc=True)
df['Team Report Time (EST)'] = df['Source Time (UTC)'].dt.tz_convert(tz='Canada/Eastern')
```

to do the same thing as

```
convertTimezone(convertTimezone([Source Time], 'UTC'), 'EST', 'UTC')
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
