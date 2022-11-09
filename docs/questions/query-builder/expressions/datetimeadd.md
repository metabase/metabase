---
title: DatetimeAdd
---

# DatetimeAdd

`datetimeAdd` takes a date and adds some unit of time to it. It's useful whenever you need to do calculations over a window of time, like taking a rolling metric (such as a moving average) over a 7 day period.

| Syntax                                                                              | Example                                              |
|-------------------------------------------------------------------------------------|------------------------------------------------------|
| `datetimeAdd(column, amount, unit)`                                                 | `datetimeAdd("March 25, 2021, 12:52:37", 1, "month")`|
| Takes a timestamp or date value and adds the specified number of time units to it.  | `April 25, 2021, 12:52:37`                           |

## Parameters

Units can be any of: "year", "quarter", "month", "day", "hour", "second", or "millisecond".

## Rolling metrics

Let's say we want to take the 7 day rolling average (moving average) for the temperature inside Mount Doom. Rolling metrics are calculated over a time period _relative_ to the reporting date. 

So, if we're reporting on the rolling average on Nov 7, 2022, we need to pick a 7 day window relative to Nov 7, 2022, such as:

- [Lagging or trailing](#lagging-or-trailing-metrics) 7 days (from Nov 1, 2022 to Nov 7, 2022)
- [Leading](#leading-metrics) 7 days (from Nov 7, 2022 to Nov 13, 2022)

Of course, you can choose any size of window you want, and place it anywhere you want. For example, you could report a 7 day rolling average on Nov 7, 2022 that takes the average temperature between Nov 4, 2022 and Nov 10, 2022 (placing the window evenly "around" the reporting date).

## Lagging or trailing metrics

| Report Date | Relative Date | Temperature | 7 Day Lagging Average |
|-------------|---------------|-------------|-----------------------|
| 2022-11-02  | Today - 6     | 1140        |                       |
| 2022-11-03  | Today - 5     | 1170        |                       |
| 2022-11-04  | Today - 4     | 1130        |                       |
| 2022-11-05  | Today - 3     | 1140        |                       |
| 2022-11-06  | Today - 2     | 1190        |                       |
| 2022-11-07  | Yesterday     | 1200        |                       |
| 2022-11-08  | Today         | 1250        |                       |


## Leading metrics

Leading metrics are a bit tricky to wrap your head around. The report dates for a leading metric are almost always in the past.

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `datetimeAdd`  |
| ----------------------- | -------------------- |
| String                  | ❌                   |
| Number                  | ❌                   |
| Timestamp               | ✅                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Limitations

## Related functions

### SQL

### Spreadsheets 

### Python

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/)
