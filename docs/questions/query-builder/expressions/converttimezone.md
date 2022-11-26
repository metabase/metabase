---
title: ConvertTimezone
---

# ConvertTimezone

`convertTimezone` shifts a datetime into a specified time zone by adding or subtracting the right number of hours from the datetime.

Time zones are rather nasty to work with (easy to misunderstand, difficult to notice), so we recommend using `convertTimezone` if

- You've checked all the possible [source time zones](#source-time-zones) that could come into play, and
- the [converted report dates](#creating-custom-report-dates) significantly enhance the interpretation of the data.

| Syntax                                                               | Example                                                       |
|----------------------------------------------------------------------|---------------------------------------------------------------|
| `convertTimezone(column, target, source)`                            | `convertTimezone("December 28, 2022, 12:00:00", "EST, "PST")` |
| Shifts a datetime from the source time zone to the target time zone. | `December 28, 2022, 9:00:00`                                  |

## Parameters

- `target` is the time zone you want to assign to your column.
- The name of the `target` time zone depends on your database. For example, you may have to use "Canada/Eastern" instead of "EST".
- `source` is only a required parameter if you have timestamps without time zones in your database. See the table below for more info.

## Source time zones

Before you do time zone conversions, make sure you know the source time zones that you're working with:

| Possible source time zones     | Description                                                         | Example                                                                                                          |
|--------------------------------|---------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Client time zone               | Time zone where an event happened.                                  | A web analytics service might capture data in the local time zone of each person who visited your website.       |
| Database time zone             | Time zone metadata that's been added to datetimes in your database. | It's a common database practice to store all datetimes in UTC.                                                   |
| No time zone                   | Missing time zone metadata                                          | Databases don't _require_ you to store datetimes with time zone metadata.                                        |
| Metabase report time zone      | Time zone that Metabase uses to _display_ datetimes.                | Metabase can display dates and times in PST, even if the dates and times are stored as UTC in your database.     |

For example, say you have a table with one row for each person who visited your website. You won't be able to tell, just from looking at the datetime `December 28, 2022, 12:00:00`, whether it's:

- stored with each person's local time zone metadata,
- stored with each person's local time zone metadata, and converted to UTC in your database, or
- stored without time zone metadata.

Regardless of how the datetimes are stored, they may be displayed in your Metabase report time zone (which overrides everything else).

## Creating custom report dates

In the sample data here, we've named each column after its source time zone. Your datasets might not make the source time zone so obvious, so make sure to confirm with your database admin or Metabase admin. It's also a really good idea to name new `convertTimezone` columns with the target time zone (such as **Team Report Time (EST)**). We promise that this makes life a lot easier when someone inevitably asks why the numbers don't match.

| Client Time                  | Database Time                | Metabase Report Time         | Team Report Time (EST)       |  Local Report Time (GMT)     |
|------------------------------|------------------------------|------------------------------|------------------------------|------------------------------|
| December 28, 2022, 00:00:00  | December 28, 2022, 18:00:00  | December 28, 2022, 10:00:00  | December 28, 2022, 07:00:00  | December 28, 2022, 12:00:00  |
| December 28, 2022, 00:00:00  | December 28, 2022, 05:00:00  | December 28, 2022, 21:00:00  | December 28, 2022, 19:00:00  | December 29, 2022, 00:00:00  |
| December 28, 2022, 00:00:00  | December 27, 2022, 16:00:00  | December 27, 2022, 08:00:00  | December 27, 2022, 05:00:00  | December 27, 2022, 10:00:00  |

Let's say you want to create custom reporting dates for a team that lives in a different time zone (EST) from the client, database, or Metabase reporting time zones.

You could create **Team Report Time (EST)** differently depending on the source time zone. If your column uses:

1. **Client Time** (where every row has a different "implicit" time zone)

```
convertTimezone([Client Time)], 'Canada/Eastern')
```

2. **Database Time** (say your database is in UTC)

```
convertTimezone([Database time (UTC)], 'EST', 'UTC')
```

3. **Metabase Report Time** (if your Metabase reports in PST)

```
convertTimezone([Metabase Report Time (PST)], 'EST', 'PST')
```

Once you've created **Team Report Time (EST)**, you could convert it again to a **Local Report Time (GMT)** (perhaps for a teammate who's temporarily living in London). Note that the output of a `convertTimezone` expression has no time zone metadata. Since **Team Report Time (EST)** is already the output of a `convertTimezone` expression, you _must_ provide the source parameter 'EST' here:

```
convertTimezone([Team Report Time (EST)], 'GMT', 'EST')
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `convertTimezone`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

This table uses `timestamp` and `datetime` interchangeably. If your dates and times are stored as strings or numbers in your database, you can [cast them to datetimes](../data-modeling/metadata-editing#casting-to-a-specific-data-type) from the Data Model page.


## Related functions

This section covers functions and formulas that work the same way as the Metabase `convertTimezone` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [datetime sample data](#creating-custom-report-dates) is stored in a PostgreSQL database (Postgres databases have [no time zone metadata](#source-time-zones):

```sql
SELECT (client_time::TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'EST' AS team_report_time_est
```

is equivalent to the Metabase `convertTimezone` expression:

```
convertTimezone([Client Time], 'EST', 'UTC')
```

If `client_time` is stored _with_ time zone metadata, for example in a Snowflake database with time zone UTC:

```sql
SELECT convert_timezone('America/Toronto', client_time) AS team_report_time_est
```

is equivalent to the Metabase `convertTimezone` expression:

```
convertTimezone([Client Time], 'EST')
```

### Spreadsheets

If our [datetime sample data](#creating-custom-report-dates) is in a spreadsheet where "Client Time" is in column A, we can change it to EST by subtracting the hours explicitly:

```
A1 - TIME(5, 0, 0)
```

to get the same result as

```
convertTimezone([Client Time)], 'EST')
```

### Python

If the [datetime sample data](#creating-custom-report-dates) is stored in a `pandas` dataframe, you could convert the **Client Time** column to a `datetime` object with time zone UTC first, then use `tz_convert` to change the time zone to EST:

```
df['Client Time (UTC)'] = pd.to_datetime(df['Client Time'], utc=True)
df['Team Report Time (EST)'] = df['Client Time (UTC)'].dt.tz_convert(tz='Canada/Eastern')
```

to do the same thing as

```
convertTimezone([Client Time)], 'EST', 'UTC')
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
