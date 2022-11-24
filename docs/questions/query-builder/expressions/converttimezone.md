---
title: ConvertTimezone
---

# ConvertTimezone

`convertTimezone` assigns a new timezone to a datetime value (by adding or subtracting the hours from your original datetime).

| Syntax                                                                                                    | Example                                                       |
|-----------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `convertTimezone(column, target, source)`                                                                 | `convertTimezone("December 28, 2022, 12:00:00", "EST, "PST")` |
| Assigns the target timezone to your datetime column. You can optionally specify a source timezone too.    | `December 28, 2022, 9:00:00`                                  |

## Parameters

- Target is the timezone you want to assign to your column.
- Source is optional. By default, the source timezone is your Metabase's [report timezone](../configuring-metabase/settings#report-timezone).

## Creating report dates

When you're working with time series data, there's a few different kinds of "source" timezones:

- Original timezone: your data might be recorded in the timezone where the event happened. For example, if you collect web analytics, your data may be recorded in the local timezone of each person who visited your website.
- Database timezone: by default, this is the timezone of the data in Metabase. Your database admin can confirm if the timestamps in your database are mapped to the same timezone.
- Metabase report timezone: overrides the database timezone. Set by your Metabase admin.

You can change these source timezones to target timezones that are easier to interpret, such as:

- A different report timezone (for example, if you want to make a report for a team in another timezone).
- Local time, if it's important for people to see data in the timezone that they live in.

| Original Time (Different Time Zones)  | Database time                | Metabase Report Time         | Team Report Time (EST)       |  Local Report Time (GMT)     |
|---------------------------------------|------------------------------|------------------------------|------------------------------|------------------------------|
| December 28, 2022, 00:00:00           | December 28, 2022, 18:00:00  | December 28, 2022, 10:00:00  | December 28, 2022, 07:00:00  | December 28, 2022, 12:00:00  |
| December 28, 2022, 00:00:00           | December 28, 2022, 05:00:00  | December 28, 2022, 21:00:00  | December 28, 2022, 19:00:00  | December 29, 2022, 00:00:00  |
| December 28, 2022, 00:00:00           | December 27, 2022, 16:00:00  | December 27, 2022, 08:00:00  | December 27, 2022, 05:00:00  | December 27, 2022, 10:00:00  |

Depending on the source timezones you know about, you could create **Team Report Time (EST)** from:

the **Original Time (Different Time Zones)**,

```
convertTimezone([Original Time (Different Time Zones)], 'EST')
```

from the **Database time** (let's say your database is in UTC),

```
convertTimezone([Database time (UTC)], 'EST', 'UTC')
```

or the **Metabase Report Time** (let's say Metabase overrides your database timezone to report in PST).

```
convertTimezone([Metabase Report Time (PST)], 'EST', 'PST')
```

You could also create a **Local Report Time** using the **Team Report Time**:

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

When you run a question using the [query_builder](https://www.metabase.com/glossary/query_builder), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [cheese sample data](#calculating-an-end-date) is stored in a PostgreSQL database:

```sql
SELECT DATE_PART('month', AGE(aging_start, aging_end)) AS age_in_months
FROM cheese
```

is equivalent to the Metabase `convertTimezone` expression:

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

Some databases, such as Snowflake and BigQuery, support functions like `DATEDIFF` or `DATE_DIFF`. For more info, check out our list of [common SQL reference guides](https://www.metabase.com/learn/debugging-sql/sql-syntax#common-sql-reference-guides).

### Spreadsheets

If our [cheese sample data](#calculating-the-age-of-an-entity) is in a spreadsheet where "Aging Start" is in column B and "Aging End" is in column C:

```
DATEDIF(A22,B22,"M")
```

produces the same result as

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

Yes, it looks kind of wrong, but the spreadsheet function really is `DATEDIF()`, not `DATEDIFF()`.

### Python

Assuming the [cheese sample data](#calculating-the-age-of-an-entity) is in a `pandas` dataframe column called `df`, you can subtract the dates directly and use `numpy`'s `timedelta` to convert the difference to months:

```
df['Age in Months'] = (df['Aging End'] - df['Aging Start']) / np.timedelta(1, 'M')
```

is equivalent to

```
datetimeDiff([Aging Start], [Aging End], 'month')
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
- [Time series comparisons](https://www.metabase.com/learn/questions/time-series-comparisons)
- [How to compare one time period to another](https://www.metabase.com/learn/dashboards/compare-times)
- [Working with dates in SQL](https://www.metabase.com/learn/sql-questions/dates-in-sql)
