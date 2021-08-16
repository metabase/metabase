# Timezone problems

<div class='doc-toc' markdown=1>
- [SQL queries are not respecting the Reporting Time Zone setting](#not-respect-time-zone-setting)
- [Dates without an explicit time zone are being converted to another day](#dates-without-explicit-tz-converted)
- [Mixing explicit and implicit time zones](#mixing-explicit-implicit)
</div>

"Wrong" numbers in charts or reports are often a result of an underlying issue with time zones. Problems of this type are extremely common with many analytics tools, and the best way to avoid them in Metabase is by selecting the "Report Time Zone" setting in the "General" tab of the Admin Panel. Doing this ensures that the time zone of query results matches the time zone used by the database for its date calculations.

"Report Time Zone" is currently supported on:

- Druid
- MySQL
- Oracle
- PostgreSQL
- Presto
- Vertica

If you're using a database that doesn't support a Report Time Zone, the next option is to ensure that the Metabase instance's time zone matches that of the database. The Metabase instance's time zone is the Java Virtual Machine's time zone, typically set via a `-Duser.timezone<..>` parameter or the `JAVA_TIMEZONE` environment variable; exactly how it is set will depend on how you launch Metabase. Note that the Metabase instance's time zone doesn't impact any databases that use a Report Time Zone.

If you suspect that you have a time zone issue, these questions may help you resolve it:

1. What is the correct time zone of the data you think is being displayed improperly (i.e., what's the right answer)?
2. Is there an explicit time zone setting on each timestamp, or are the timestamps being stored without a time zone? For example, `Dec 1, 2019 00:00:00Z00` includes the timezone (shown after the `Z`), but `Dec 1, 2019` has an implied time zone.
2. What time zone is the database server set to?
3. What time zone is the Metabase server set to?
4. What is your Report Time Zone setting?
5. What is your browser's time zone setting?

Once you have this information, you can dig into the "mistakes" you are seeing. These often in an aggregation when timestamps with different time zones are being compared or combined, soit is useful to simplify the aggregation as much as you can while still seeing the "mistake." For example, if you are looking at a "Net Negative Churn by Quarter" report that is based on an underlying table consisting of orders, see if the "Count of Orders by Quarter" has similarly incorrect behavior. If so, troubleshoot the second, simpler question.

Once you have simplified a question as much as possible, you can try to understand exactly what time zone conversion is causing the underlying problem. As an example, assume you are looking at a time series with daily values; if your error is happening with weeks or other time granularities, perform the same sequence of steps using your specific granularity instead of days:

1. Pick a specific day where you know the number is incorrect.
2. Click on the data point in a chart, or a cell in a result table, and select "View these X."
3. Open this question in two other tabs in your browser, but with the date filters changed such that one tab has the rows in the underlying table from the _previous_ day, and the other table has the rows in the underlying table from the _next_ day.
4. Check that the date field being used to group the result in the underlying display is correct. If it is different from what you have stored in the database, or what you have in another tool, then the timestamp is being transformed incorrectly across the board. This often happens when you use a date or time lacking an explicit time zone.
5. If the underlying timestamps are correct (which should be the case if they have explicit time zones), it is likely that the individual times are being grouped into days in a different time zone than the one you want.
6. To find out which time zone they are being transformed into, tweak the times on the date filters on the question you are looking at by moving the start time and start date backwards by an hour until you either get the correct number or you have gone back by 12 hours.
7. If that doesn't work, try moving the start and end times forward by an hour until you either get the correct number of you've gone forward by 12 hours.
8. If any of your time zones include India, Newfoundland, or another jurisdiction with a half-step time zone, you may need to do the steps above in half hour increments.
9. If by this point you have the correct value, it means your time zone was converted by the number of hours forward or backwards you manually set the filter. If not, then the problem might not be a direct time zone issue.

Now that you have the time zone adjustment, go back to the earlier list of time zone questions and think about where this could have occurred. For example, let's say you have a PST server time zone and a GMT reporting time zone. If you had to manually go back 9 hours to get correct numbers, that suggests that the conversion is not happening for some reason, which in turn suggests you are using timestamps without a time zone.

A few specific problems are described below. If none of them apply, please [open a bug report][metabase-file-bug] with the above information (time zones and the results of the second troubleshooting process) as well as your Metabase, OS, and web browser versions.

<h2 id="not-respect-time-zone-setting">SQL queries are not respecting the Reporting Time Zone setting</h2>

**How to detect this:**
You are not able to click on a cell in a result table or a chart.

**How to fix this:**
We do not currently apply a reporting time zone to the results of SQL queries, so you should set one manually.

<h2 id="dates-without-explicit-tz-converted">Dates without an explicit time zone are being converted to another day</h2>

**How to detect this:**
This occurs when you are grouping by a date (rather than by a time) that does not have a time zone attached to it. Look at every time field your question uses in the Data Model Reference, and see if any of them are simply a "Date" field.

**How to fix this:**
Make sure the server time zone reflects the reporting time zone, because when a query is run on Metabase, the server applies the configured time zone to that date.

<h2 id="mixing-explicit-implicit">Mixing explicit and implicit time zones</h2>

**How to detect this:**
This often happens if you compare or perform arithmetic on two dates where one has an explicit time zone and one does not. This typically involves a question that uses multiple fields (e.g., when you filter on one timestamp and group by another). Check the time zones of each of the dates or times you are using in your question.

**How to fix this:**
You will need to explicitly cast the time zone that does not have an explicit time zone. This will need to be done either in a SQL query or by transforming the data in your database to ensure both timestamps have time zones.

[metabase-file-bug]: https://github.com/metabase/metabase/issues/new/choose
