---
title: Now
---

# Now

`now` returns the current datetime using your Metabase [report timezone](../../../configuring-metabase/localization.md#report-timezone).

## Creating conditional logic using the current date or time

Let's say you have some project data, and you want to add a status column for each task. We'll assume today's date and time is November 22, 2022, 12:00:00.

| Task   | Start                       | Deadline                    | Status          |
| ------ | --------------------------- | --------------------------- | --------------- |
| Draft  | November 1, 2022, 12:00:00  | November 30, 2022, 12:00:00 | In progress     |
| Review | November 15, 2022, 12:00:00 | November 19, 2022, 12:00:00 | Needs extension |
| Edit   | November 22, 2022, 12:00:00 | November 22, 2022, 12:00:00 | DUE RIGHT NOW!  |

To mark a task in progress, you'd use the expression:

```
now() >= [Start] AND now() < [Deadline]
```

To check if you need to ask for an extension:

```
now() >= [Start] AND now() >= [Deadline]
```

If you're looking for an adrenaline rush (and you have real-time data), you can flag the tasks that are due _right this second_:

```
now() = [Deadline]
```

To set up the **Status** column that combines all three situations above, you'd wrap everything in a `case` expression:

```
case(now() >= [Start] AND now() < [Deadline], "In progress",
     now() >= [Start] AND now() >= [Deadline], "Needs extension",
     now() = [Deadline], "DUE RIGHT NOW!")
```

## Data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Returned by `now()` |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| String                                                                                                                         | ❌                  |
| Number                                                                                                                         | ❌                  |
| Timestamp                                                                                                                      | ✅                  |
| Boolean                                                                                                                        | ❌                  |
| JSON                                                                                                                           | ❌                  |

`now` returns a `timestamp with time zone` if time zones are supported by your database, otherwise `now` returns a `timestamp without time zone`.

For more info about the way these data types behave in Metabase, see [Timezones](../../../configuring-metabase/timezones.md#data-types).

## Limitations

`now` might not actually be _now_ (in your local time) if you don't live in the same timezone as your Metabase [report time zone](../../../configuring-metabase/localization.md#report-timezone).

If you need to compare `now` to a column in a different time zone, use [convertTimezone](./converttimezone.md) to shift both columns into the same time zone. For example:

```
convertTimezone(now, 'UTC', <report timezone>) >= convertTimezone([Deadline], 'UTC', <source time zone>)
```

## Related functions

Different ways to do the same thing, because while you'd love to use custom expressions more, now's just not the time.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

When you run a question using the [query builder](https://www.metabase.com/glossary/query-builder), Metabase will convert your query builder settings (filters, summaries, etc.) into a SQL query, and run that query against your database to get your results.

By default, `now` uses your Metabase's [report time zone](../../../configuring-metabase/localization.md#report-timezone). If your admin hasn't set a report time zone, `now` will use your database's time zone.

Say you're using a Postgres database. If your Metabase report time zone is set to EST, you'll get `now` in EST:

```sql
SELECT CURRENT_TIMESTAMP AT TIME ZONE 'EST'
```

If you don't have a report time zone, you'll get `now` in the Postgres database's time zone (typically UTC):

```sql
SELECT CURRENT_TIME
```

### Spreadsheets

The spreadsheet function `NOW()` gets the current date and time in your operating system's time zone (the time that's on your computer or mobile device).

### Python

You can use `pd.Timestamp.now()` using the `pandas` module. This will give you a `Timestamp` object with the current date and time in your operating system's time zone.

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/custom-expressions)
- [Time series analysis](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/time-series/start)
