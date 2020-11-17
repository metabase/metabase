## Overview
The source of "wrong" numbers in charts or reports is often due to an underlying time zone issue. This type of issue is extremely common, both in Metabase and in many other analytics tools and services. The best way to avoid surprising time zone behavior is by selecting the "Report Time Zone" setting in the General settings tab of the Admin Panel. The Report Time Zone ensures that the time zone of query results matches the time zone used by the database for its date calculations. A Report Time Zone is currently supported on the following databases:

- Druid
- MySQL
- Oracle
- PostgreSQL
- Presto
- Vertica

If you're using a database that doesn't support a Report Time Zone, it's best to ensure that the Metabase instance's time zone matches the time zone of the database. The Metabase instance's time zone is the Java Virtual Machine's time zone, typically set via a `-Duser.timezone<..>` parameter or the `JAVA_TIMEZONE` environment variable. How the time zone is set will depend on how you launch Metabase. Note that the Metabase instance's time zone doesn't impact any databases that use a Report Time Zone.


## Troubleshooting Process

When you suspect a you have a time zone issue, you should collect a bit of information about your overall system.

1. What is the time zone of the data you think is being displayed improperly? (I.e., in the database itself.)
2. Are you using an explicit time zone setting on each timestamp, or are the timestamps being stored without a timestamp? (E.g., `Dec 1, 2019 00:00:00Z00` is an explicitly timestamped value, but `Dec 1, 2019` has an implied time zone.)
2. What time zone is the database server set to?
3. What time zone is the server that is running Metabase set to?
4. What is your Reporting Time zone setting?
5. What is your browser time zone setting?

With this information collected, you can dig into the actual "mistakes" you are seeing. Most often these occur in an aggregation. It is useful to simplify the aggregation as much as you can while still seeing the "mistake." For example, if you are looking at a "Net Negative Churn by Quarter" report that is based on an underlying table consisting of orders, see if the "count of orders by Quarter" has similarly incorrect behavior. If so, troubleshoot the second, simpler question.

Once you have simplified a question as much as possible, you can try to understand exactly what time zone conversion is causing the underlying problem. In the below, we assume that you are looking at a time series with daily values. If your error is happening with weeks, or other time granularities, perform the same sequence of steps but translating "day" to your specific granularity.

1. Pick a specific day where you know the number is incorrect.
2. Click on the data point in a chart, or a cell in a result table, and select "View these X."
3. Open this question in two other tabs in your browser, but with the date filters changed such that one tab has the rows in the underlying table from the _previous_ day, and the other table has the rows in the underlying table from the _next_ day.
4. Check that the date field being used to group the result in the underlying display is correct. If it is different from what you have stored in the database, or what you have in another tool, then the timestamp is being transformed across the board into something incorrect. This is often the case when you are using a date or time lacking an explicit time zone.
5. If the underlying timestamps are correct (which is often the case if you are using dates or times with explicit time zones), it is likely that the individual times are being grouped into days in a different time zone than the one you want.
6. To find out which time zone they are being transformed into, tweak the times on the date filters on the question you are looking at by moving the start time and start date backwards by an hour until you either get the correct number or you have gone back by 12 hours.
7. If that doesn't work, try moving the start and end times forward by an hour until you either get the correct number of you've gone forward by 12 hours.
8. Additionally, if any of your time zones include India, you will need to do this by half hour increments as well.
9. If by this point you have reached a correct number, that means your time zone was converted by the number of hours forward or backwards you manually set the filter. If not, then the problem might not be a direct time zone issue.

Now that you have the time zone adjustment, look at the list of time zone questions in the first set of steps and think about where this could have occurred.

For example, let's say have a PST server time zone, and a GMT reporting time zone. If you had to manually go back 9 hours to get correct numbers, that suggests that the conversion is not happening for some reason -- this suggests you are using timestamps without a time zone.

You can see a number of common problems below. If none of them apply, please [open a bug report](https://github.com/metabase/metabase/issues/new/choose) with the above information (time zones, and the results of the second troubleshooting process) as well as your Metabase, OS, and web browser versions.

## Specific Problems:

### SQL queries are not respecting the Reporting Time Zone setting
#### How to detect this:
You are not able to click on a cell in a result table or a chart.

#### How to fix this:
We do not currently apply a reporting time zone to the results of SQL queries, so you should set one manually.

### Dates without an explicit time zone are being converted to another day
#### How to detect this:
This occurs when you are grouping by a date (vs. a time) that does not have a time zone attached to it. Look at every time field your question uses in the Data Model Reference, and see if any of them are simply a "Date" field.

#### How to fix this:
You will need to make sure the server time zone reflects the reporting time zone, because when a query is run on Metabase the server applies the time zone to which it is set to that date.


### Mixing explicit and implicit time zones
#### How to detect this:
This often happens if you compare or perform arithmetic on two dates where one has an explicit time zone and one does not. This typically involves a question that uses multiple fields (e.g., when you filter on one timestamp and group by another). Check the time zones of each of the dates or times you are using in your question.

#### How to fix this:
You will need to explicitly cast the time zone that does not have an explicit time zone. This will need to be done either in a SQL query or by transforming the data in your database to ensure both timestamps have time zones.
