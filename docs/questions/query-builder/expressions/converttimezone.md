---
title: ConvertTimezone
---

# ConvertTimezone

`convertTimezone` assigns a new time zone to a datetime value (by adding to, or subtracting from the original datetime).

| Syntax                                                                                                    | Example                                                       |
|-----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `convertTimezone(column, target, source)`                                                                 | `convertTimezone("December 28, 2022, 12:00:00", "EST, "PST")` |
| Assigns the target time zone to your datetime column. You can optionally specify a source time zone too.  | `December 28, 2022, 9:00:00`                                  |

## Parameters

- Target is the time zone you want to assign to your column.
- Source is optional. By default, the source time zone is your Metabase's [report time zone](../configuring-metabase/settings#report-timezone).

## Creating custom report dates

When you're working with time series data, there's a few different kinds of "source" time zones:

- **Original time zone**: the time zone where the event happened. For example, if you collect web analaytics, your analytics service might capture the local time zone of each person who visited your website.
- **No time zone**: time zone metadata is missing. Maybe your events took place in a fifth dimension.
- **Database time zone**: the time zone that your database uses to _store_ datetime data. For example, your data team might convert all "original" time zones to UTC in the database.
- **Metabase report time zone**: the time zone that Metabase uses to _display_ datetime data. For example, if your database time zone is in UTC, your Metabase admin can choose to display all dates and times in PST.

You should only change these source time zones to target time zones if it'll help people interpret the data:

- A custom report time zone (for example, say you live in HKT, but you're making a report for a team in EST).
- Local time, if it's important for people to see data in the time zone that they live in.

| Original Time                | Database Time                | Metabase Report Time         | Team Report Time (EST)       |  Local Report Time (GMT)     |
|------------------------------|------------------------------|------------------------------|------------------------------|------------------------------|
| December 28, 2022, 00:00:00  | December 28, 2022, 18:00:00  | December 28, 2022, 10:00:00  | December 28, 2022, 07:00:00  | December 28, 2022, 12:00:00  |
| December 28, 2022, 00:00:00  | December 28, 2022, 05:00:00  | December 28, 2022, 21:00:00  | December 28, 2022, 19:00:00  | December 29, 2022, 00:00:00  |
| December 28, 2022, 00:00:00  | December 27, 2022, 16:00:00  | December 27, 2022, 08:00:00  | December 27, 2022, 05:00:00  | December 27, 2022, 10:00:00  |

Before you do time zone conversions, make sure you know the source time zone that you're working with. The example here shows you how the source time zones can be different depending on the system that it comes from (original event capture, database, Metabase), but your datasets might not make it so obvious. 

When you make a custom column with a new time zone, it's usually a good idea to name the column with that time zone. We promise that this makes life a lot easier when someone inevitably asks why certain numbers don't match.

For example, you could create **Team Report Time (EST)** differently depending on the source:

1. **Original Time**

```
convertTimezone([Original Time)], 'EST')
```

2. **Database Time** (say you know your database is in UTC)

```
convertTimezone([Database time (UTC)], 'EST', 'UTC')
```

3. **Metabase Report Time** (if you know that Metabase reports in PST)

```
convertTimezone([Metabase Report Time (PST)], 'EST', 'PST')
```

Once you've created **Team Report Time (EST)**, you could convert it again to a **Local Report Time (GMT)** (maybe for a teammate on the move):

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

If our [datetime sample data](#creating-custom-report-dates) is stored in a PostgreSQL database:

```sql
SELECT original_time::TIMESTAMP AT TIME ZONE 'EST' AS team_report_time_est
```

is equivalent to the Metabase `convertTimezone` expression:

```
convertTimezone([Original Time)], 'EST')
```

### Spreadsheets

If our [datetime sample data](#creating-custom-report-dates) is in a spreadsheet where "Original Time" is in column A, we can add the hours explicitly

```
A1 - TIME(5, 0, 0)
```

to get the same result as

```
convertTimezone([Original Time)], 'EST')
```

### Python

If the [datetime sample data](#creating-custom-report-dates) is stored in a `pandas` dataframe columns as `timestamp` objects, you can use `tz_convert`:

```
df['Team Report Time (EST)'] = df['Original Time'].tz_convert(tz = 'EST')
```

to do the same thing as

```
convertTimezone([Original Time)], 'EST')
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
