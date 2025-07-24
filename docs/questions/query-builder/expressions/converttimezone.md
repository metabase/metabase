---
title: ConvertTimezone
---

# ConvertTimezone

`convertTimezone` shifts a timestamp into a specified time zone by adding or subtracting the right interval from the timestamp.

| Syntax                                                                | Example                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `convertTimezone(column, target, source)`                             | `convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")`      |
| Shifts a timestamp from the source time zone to the target time zone. | Returns the value `2022-12-28T09:00:00`, displayed as `December 28, 2022 9:00 AM` |

Timestamps and time zones are rather nasty to work with (it's easy to make mistakes, and difficult to catch them), so you should only try to use `convertTimezone` if the interpretation of your data is sensitive to time-based cutoffs.

For example, if you're tracking user logins over time, you probably won't run your business differently if some logins get counted on Mondays instead of Tuesdays. However, if you're using Metabase to do something precise, like your taxes, you (and the government) will probably care a lot more about the difference between transactions that occurred on Dec 31 vs. Jan 1.

## Supported time zones

Metabase supports [tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

## Parameters

`column` can be any of:

- The name of a timestamp column,
- a custom expression that returns a [timestamp](#accepted-data-types), or
- a string in the format `"YYYY-MM-DD` or `"YYYY-MM-DDTHH:MM:SS"`.

`target`:

- The name of the time zone you want to assign to your column.

`source`:

- The name of your column's current time zone.
- Required for columns or expressions with the data type `timestamp without time zone`.
- Optional for columns or expressions with the data type `timestamp with time zone`.
- For more info, see [Accepted data types](#accepted-data-types).

We support [tz database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) time zone names (such as "Canada/Eastern" instead of "EST").

## Creating custom report dates

Let's say that you have some time series data that's stored in one or more time zones (**Source Time**). You want to create custom reporting dates for a team that lives in EST.

| Source Time                 | Team Report Time (EST)      |
| --------------------------- | --------------------------- |
| December 28, 2022, 10:00:00 | December 28, 2022, 07:00:00 |
| December 28, 2022, 21:00:00 | December 28, 2022, 19:00:00 |
| December 27, 2022, 08:00:00 | December 27, 2022, 05:00:00 |

If **Source Time** is stored as a `timestamp with time zone` or a `timestamp with offset`, you only need to provide the `target` time zone:

```
convertTimezone([Source Time], 'EST')
```

If **Source Time** is stored as a `timestamp without time zone`, you _must_ provide the `source` time zone (which will depend on your database time zone):

```
convertTimezone([Source Time], 'EST', 'UTC')
```

It's usually a good idea to label `convertTimezone` columns with the name of the target time zone (or add the target time zone to the metadata of a model). We promise this will make your life easier when someone inevitably asks why the numbers don't match.

If you're not getting the results that you expect:

- Check if you have the right [source time zone](#choosing-a-source-time-zone).
- Ask your database admin about `timestamp with time zone` vs. `timestamp without time zone` (for more info, see [Accepted data types](#accepted-data-types)).

### Choosing a source time zone

When you're doing time zone conversions, make sure you know the source time zone that you're working with. Different columns (and even different rows) in the same table, question, or model can be in different "source" time zones.

| Possible source time zone | Description                                                          | Example                                                                                                      |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Client time zone          | Time zone where an event happened.                                   | A web analytics service might capture data in the local time zone of each person who visited your website.   |
| Database time zone        | Time zone metadata that's been added to timestamps in your database. | It's a common database practice to store all timestamps in UTC.                                              |
| No time zone              | Missing time zone metadata                                           | Databases don't _require_ you to store timestamps with time zone metadata.                                   |
| Metabase report time zone | Time zone that Metabase uses to _display_ timestamps.                | Metabase can display dates and times in PST, even if the dates and times are stored as UTC in your database. |

For example, say you have a table with one row for each person who visited your website. It's hard to tell, just from looking at `December 28, 2022, 12:00 PM`, whether the "raw" timestamp is:

- stored using your database's time zone (usually UTC),
- stored without time zone metadata (for example, if the website visitor is in HKT, then the timestamp `December 28, 2022, 12:00 PM` might "implicitly" use Hong Kong time),
- _displayed_ in your Metabase report time zone.

For more gory details, see [Limitations](#limitations).

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `convertTimezone` |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| String                                                                                                                         | ❌                           |
| Number                                                                                                                         | ❌                           |
| Timestamp                                                                                                                      | ✅                           |
| Boolean                                                                                                                        | ❌                           |
| JSON                                                                                                                           | ❌                           |

We use "timestamp" and "datetime" to talk about any temporal data type that's supported by Metabase.

If your timestamps are stored as strings or numbers in your database, an admin can [cast them to timestamps](../../../data-modeling/metadata-editing.md#casting-to-a-specific-data-type) from the Table Metadata page.

To use `convertTimezone` without running into errors or pesky undetectable mistakes, you should know that there are a few varieties of `timestamp` data types:

| Data type                     | Description                               | Example                                              |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `timestamp with time zone`    | Knows about location.                     | `2022-12-28T12:00:00 AT TIME ZONE 'America/Toronto'` |
| `timestamp with offset`       | Knows about the time difference from UTC. | `2022-12-28T12:00:00-04:00`                          |
| `timestamp without time zone` | No time zone info.                        | `2022-12-28T12:00:00`                                |

Note that the first part of the timestamp is in UTC (same thing as GMT). The time zone or offset tells you how much time to add or subtract for a given time zone.

`convertTimezone` will work with all three types of timestamps, but the output of `convertTimezone` will always be a `timestamp without time zone`.

## Limitations

`convertTimezone` is currently unavailable for the following databases:

- Amazon Athena
- Databricks
- Druid
- MongoDB
- Presto
- SparkSQL
- SQLite
- Metabase Sample Database

### Notes on source time zones

Metabase displays timestamps without time zone or offset information, which is why you have to be so careful about the [source time zone](#choosing-a-source-time-zone) when using `convertTimezone`.

The Metabase report time zone only applies to `timestamp with time zone` or `timestamp with offset` data types. For example:

| Raw timestamp in your database           | Data type                     | Report time zone | Displayed as           |
| ---------------------------------------- | ----------------------------- | ---------------- | ---------------------- |
| `2022-12-28T12:00:00 AT TIME ZONE 'CST'` | `timestamp with time zone`    | 'Canada/Eastern' | Dec 28, 2022, 7:00 AM  |
| `2022-12-28T12:00:00-06:00`              | `timestamp with offset`       | 'Canada/Eastern' | Dec 28, 2022, 7:00 AM  |
| `2022-12-28T12:00:00`                    | `timestamp without time zone` | 'Canada/Eastern' | Dec 28, 2022, 12:00 AM |

The Metabase report time zone will not apply to the output of a `convertTimezone` expression. For example:

```
convertTimezone("2022-12-28T12:00:00 AT TIME ZONE 'Canada/Central'", "Canada/Pacific", "Canada/Central")
```

will produce a raw `timestamp without time zone`

```
2022-12-28T04:00:00
```

and displayed in Metabase as

```
Dec 28, 2022, 4:00 AM
```

If you use `convertTimezone` on a `timestamp without time zone`, make sure to use 'UTC' as the `source` time zone, otherwise the expression will shift your timestamp by the wrong amount. For example, if our `timestamp without time zone` is only "implied" to be in CST, we should use 'UTC' as the `source` parameter to get the same result as above.

For example, if we choose 'CST' as the `source` time zone for a `timestamp without time zone`:

```
convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Central")
```

we'll get the raw `timestamp without time zone`

```
2022-12-28T10:00:00
```

displayed in Metabase as

```
Dec 28, 2022, 10:00 AM
```

## Related functions

This section covers functions and formulas that work the same way as the Metabase `convertTimezone` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query-builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [timestamp sample data](#creating-custom-report-dates) is a `timestamp without time zone` stored in a PostgreSQL database:

```sql
SELECT source_time::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'EST' AS team_report_time_est
```

is the same as the `convertTimezone` expression with a `source` parameter set to 'UTC':

```
convertTimezone([Source Time], "Canada/Eastern", "UTC")
```

If `source_time` is a `timestamp with time zone` or `timestamp with offset` (for example, in a Snowflake database), then we don't need to specify a source time zone in SQL or in Metabase.

```sql
SELECT convert_timezone('America/Toronto', source_time) AS team_report_time_est
```

is the same as

```
convertTimezone([Source Time], "Canada/Eastern")
```

Remember that the time zone names depend on your database. For example, Snowflake doesn't accept most time zone abbreviations (like EST).

### Spreadsheets

If our [timestamp sample data](#creating-custom-report-dates) is in a spreadsheet where "Source Time" is in column A, we can change it to EST by subtracting the hours explicitly:

```
A1 - TIME(5, 0, 0)
```

to get the same result as

```
convertTimezone([Client Time], "Canada/Eastern")
```

### Python

If the [timestamp sample data](#creating-custom-report-dates) is stored in a `pandas` dataframe, you could convert the **Source Time** column to a `timestamp` object with time zone first(basically making a `timestamp without time zone` into a `timestamp with time zone`), then use `tz_convert` to change the time zone to EST:

```
df['Source Time (UTC)'] = pd.to_timestamp(df['Source Time'], utc=True)
df['Team Report Time (EST)'] = df['Source Time (UTC)'].dt.tz_convert(tz='Canada/Eastern')
```

to do the same thing as a nested `convertTimezone` expression

```
convertTimezone(convertTimezone([Source Time], "UTC"), "Canada/Eastern", "UTC")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/custom-expressions)
- [Time series analysis](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/time-series/start)
