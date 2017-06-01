## Overview
Oftentimes the source of "wrong" numbers in charts or reports is due to an underlying timezone issue. They are extremely common, both in Metabase, and in many other analytics tools and services. 


## Troubleshooting Process

When you suspect a timezone issue, you should collect a bit of information about your overall system.

1. What is the timezone of the data you think is being displayed improperly? (Eg, in the database itself)
2. Are you using an explicit timezone setting on each timestamp or are the timestamps being stored without a timestamp (eg, `Dec 1, 2019 00:00:00Z00` is an explicitly timestamped value vs `Dec 1, 2019` where the timezone is implied)
2. What timezone is the database server set to?
3. What timezone is the server that is running Metabase set to?
4. What is your Reporting Timezone setting?
5. What is your browser timezone setting?

With this information collected, you can dig into the actual "mistakes" you are seeing. Most often these occur in an aggregation. It is useful simplifying the aggregation as much as you can while still seeing the "mistake". For example if you are looking at a "Net Negative Churn by Quarter" report that is based on an underlying table consisting of orders, see if the "count of orders by Quarter" has similarly incorrect behaviour. If so, troubleshoot the second, simpler question.

Once you have simplified a question as much as possible, you can try to understand exactly what timezone conversion is causing the underlying problem. In the below, we assume that you are looking at a timeseries with daily values. If your error is happening with weeks, or other time granularities, perform the same sequence of steps but translating "day" to your specific granularity. 

1. Pick a specific day where you know the number is incorrect. 
2. Click on the data point in a chart or a cell in a result table and select "View these X". 
3. Open two other tabs in your browser with date filters changed such that one tab has the rows in the underlying table from the previous day, and the other table has the rows in the underlying table from the next day.
4. Check that the date field being used to group the result in the underlying display is correct. If it is different from what you have stored in the database, or what you have in another tool, then the timestamp is being transformed across the board into something incorrect. This is often the case when you are using a date or time lacking an explicit timezone.
5. If the underlying timestamps are correct (this is often the case if you are using dates or times with explicit timezones), it is likely that the individual times are being grouped into days in a different timezone than the one you want.
6. To find out which timezone they are being transformed into, tweak the times on the date filters on the question you are looking at by moving the start time and start date backwards by an hour until you either get the correct number or you have gone back by 12 hours.
7. If that doesn't work, try moving the start and end times forward by an hour until you either get the correct number of you've gone forward by 12 hours. 
8. Additionally, if any of your timezones include India, you will need to do this by half hour incremenets as well. 
9. If by this point you have reached a correct number, that means your timezone was converted by the number of hours forward or backwards you manually set the filter. If not, then the problem might not be a direct timezone issue. 

Now that you have the timezone adjustment, look at the lit of timezones in the first set of steps and think about where this could have occured. 

For example, lets say have a PST server timeszone, and a GMT reporting timezone. If you had to manually go back 9 hours to get correct numbers, that suggests that the conversion is not happening for some reason -- this suggests you are using timestamps without a timezone. 

You can see a number of common problems below, if none of them apply, please open a bug report at www.github.com/metabase/metabase/issues/new with the above information (timezones, and the results of the second troubleshooting process) as well as your Metabase, OS and web browser versions. 

## Specific Problems:

### SQL queries are not respecting the Reporting Time Zone setting
#### How to detect this -
If you are not able to click on a cell in a result table or a chart.

#### How to fix this -
We do not currently apply a reporting timezone to the results of SQL queries, and you should manually set one. 

### Dates without an explicit timezone are being converted to another day 
#### How to detect this -
This occurs when you are grouping by a date (vs a time) that does not have a timezone attached to it. Look at every time field your question uses in the Data Model Reference, and see if any of them is simply a "Date" field. 

#### How to fix this -
You will need to make sure the server timezone reflects the reporting timezone, as when a query is run on Metabase, the server applies the timezone it is set to, to that date. 


### Mixing explicit and implicit timezones
#### How to detect this -
This often happens if you compare or perform arithmatic on two dates where one has an explicit timezone and one does not. 

This typically involves a question that uses multiple fields (eg, when you filter on one timestamp and group by another). Check the timezones of each of the dates or times you are using in your question. 

#### How to fix this -
You will need to explicitly cast the timezone that does not have an explicit timezone. This will need to be done either in a SQL query or by transforming the data in your database to ensure both timestamps have timezones.
