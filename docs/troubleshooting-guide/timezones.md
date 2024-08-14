---
title: The dates and times in my questions and charts are wrong
---

# The dates and times in my questions and charts are wrong

You are doing calculations with dates and times, or displaying them in charts, but:

- the values appear to be wrong, or
- summary values are wrong.

## Is the problem due to time zones?

**Root cause:** Dates and times are stored using different time zones, but some or all of those time zones aren't taken into account when doing calculations (i.e., the problem is inconsistent data).

**Steps to take:**

To fix this problem you'll need answers to these questions:

1. What is the correct time zone of the data you think is being displayed improperly (i.e., what's the right answer)?
2. Is there an explicit time zone setting on every timestamp, or are some or all timestamps being stored without a time zone? For example, `Dec 1, 2019 00:00:00Z00` includes the time zone (shown after the `Z`), but `Dec 1, 2019` doesn't.
3. What time zone is the database server using?
4. What time zone is Metabase using?

Once you have these answers, look for cases like these:

1. Your question or chart is comparing or sorting values with inconsistent or missing time zones. For example, if a flight's departure and arrival times are reported in local time, it can appear to arrive before it has left.
2. Your question is aggregating timetsamps with different time zones: for example, the "daily" totals for your website's traffic include more than 24 hours worth of data because you are using the local dates from East Asia, Europe, and the Americas.

Once you think you have identified a problem, drill down to understand exactly what time zone conversion is causing the underlying problem. For example, suppose you're looking at a time series with daily values; if your error is happening with weekly totals, you can:

1. Pick a specific day where you know the number is incorrect.
2. Click on the data point in a chart, or a cell in a result table, and select "See these X."
3. Open this question in two other tabs in your browser. Change the date filters so that one tab has the rows in the underlying table from the _previous_ day, and the other table has the rows in the underlying table from the _next_ day.
4. Check that the date field being used to group the result in the underlying display is correct. If it is different from what you have stored in the database, or what you have in another tool, then the timestamp is being transformed incorrectly across the board. This often happens when you use a date or time lacking an explicit time zone.
5. If the underlying timestamps are correct (which they should if they have explicit time zones), the individual times are probably being grouped into days in a different time zone than the one you want.
6. To find out which time zone they are being transformed to, tweak the times on the date filters on the question you are looking at by moving the start time and start date backwards by an hour until you either get the correct number or you have gone back by 12 hours. (If any of your time zones include India, Newfoundland, or another jurisdiction with a half-step time zone, you may need to do this in half-hour increments.)
7. If that doesn't work, try moving the start and end times forward by an hour until you either get the correct number of you've gone forward by 12 hours.
8. If by this point you have the correct value, it means your time zone was converted by the number of hours forward or backwards you manually set the filter. If that's the case, check whether the offset you've come up with matches either the time zone of the data warehouse or the timezone of Metabase itself.

## Is the Report Time Zone set incorrectly?

**Root cause:** Wrong numbers in questions or charts can be caused by a mis-match in the time zone being used by Metabase and the time zone being used by the data warehouse.

**Steps to take:**

1. Check the [report timezone setting](../configuring-metabase/localization.md#report-timezone) from **Admin settings** > **Settings** > **Localization**.
2. If you're using a database that doesn't support the report timezone setting, ensure that Metabase's time zone matches that of the database. Metabase's time zone is the Java Virtual Machine's time zone, typically set via a `-Duser.timezone<..>` parameter or the `JAVA_TIMEZONE` environment variable; exactly how it is set will depend on how you launch Metabase. Note that Metabase's time zone doesn't impact any databases that use a Report Time Zone.

## Are SQL queries not respecting the Reporting Time Zone setting?

**Root cause:** We don't currently apply a reporting time zone to the results of SQL queries.

**Steps to take:**

Set a reporting time zone explicitly in your SQL query.

For example, you can write something like this with PostgreSQL:

```sql
SELECT column::TIMESTAMP AT TIME ZONE 'EST' AS column_est
```

This statement casts the column to a `timestamp` data type first, then converts the `timestamp` into a `timestamptz` data type, with time zone 'EST'.

## Are dates without an explicit time zone being converted to another day?

**Root cause:** You are grouping by a date (rather than by a time) that lacks a time zone.

**Steps to take:**

1. Look at every time field your question uses in the [Data Model Reference](../exploration-and-organization/data-model-reference.md) and see if any of them are simply a "Date" field.
2. If so, make sure the server time zone reflects the reporting time zone, because when a query is run on Metabase, the server applies the configured time zone to that date.

## Are you mixing explicit and implicit time zones?

**Root cause:** You're comparing or doing arithmetic on two dates where one has an explicit time zone and one doesn't.

**Steps to take:**

1. This typically happens with a question that uses multiple fields: for example, you're filtering on one timestamp and grouping by another. Check the time zones of each of the dates or times you are using in your question.
2. You'll need to explicitly set the time zone for any value that lacks an explicit time zone. This will need to be done either in a SQL query or by transforming the data in your database to ensure both timestamps have time zones.
