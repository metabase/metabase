---
title: List of expressions
redirect_from:
  - /docs/latest/users-guide/expressions-list
---

# List of expressions

For an introduction to expressions, check out the [overview of custom expressions][expressions].

- [Aggregations](#aggregations)

  - [Average](#average)
  - [Count](#count)
  - [CountIf](./expressions/countif.md)
  - [CumulativeCount](#cumulativecount)
  - [CumulativeSum](#cumulativesum)
  - [Distinct](#distinct)
  - [Max](#max)
  - [Median](#median)
  - [Min](#min)
  - [Percentile](#percentile)
  - [Share](#share)
  - [StandardDeviation](#standarddeviation)
  - [Sum](#sum)
  - [SumIf](./expressions/sumif.md)
  - [Variance](#variance)

- Functions

  - [Logical functions](#logical-functions)

    - [between](#between)
    - [case](./expressions/case.md)
    - [coalesce](./expressions/coalesce.md)
    - [isnull](./expressions/isnull.md)
    - [notnull](#notnull)

  - [Math functions](#math-functions)

    - [abs](#abs)
    - [ceil](#ceil)
    - [exp](#exp)
    - [floor](#floor)
    - [log](#log)
    - [power](#power)
    - [round](#round)
    - [sqrt](#sqrt)

  - [String functions](#string-functions)

    - [concat](./expressions/concat.md)
    - [contains](#contains)
    - [doesNotContain](#doesnotcontain)
    - [endsWith](#endswith)
    - [isempty](./expressions/isempty.md)
    - [ltrim](#ltrim)
    - [length](#length)
    - [lower](#lower)
    - [notempty](#notempty)
    - [regexextract](./expressions/regexextract.md)
    - [replace](#replace)
    - [rtrim](#rtrim)
    - [startsWith](#startswith)
    - [substring](./expressions/substring.md)
    - [trim](#trim)
    - [upper](#upper)

  - [Date functions](#date-functions)

    - [convertTimezone](./expressions/converttimezone.md)
    - [datetimeAdd](./expressions/datetimeadd.md)
    - [datetimeDiff](./expressions/datetimediff.md)
    - [datetimeSubtract](./expressions/datetimesubtract.md)
    - [day](#day)
    - [hour](#hour)
    - [interval](#interval)
    - [minute](#minute)
    - [month](#month)
    - [now](./expressions/now.md)
    - [quarter](#quarter)
    - [relativeDateTime](#relativedatetime)
    - [second](#second)
    - [week](#week)
    - [weekday](#weekday)
    - [year](#year)

  - [Window functions](#window-functions)
    - [Offset](#offset)

- [Limitations](#limitations)
  - [Database limitations](#database-limitations)

## Aggregations

Aggregation expressions take into account all values in a field. They can only be used in the **Summarize** section of the query builder.

### Average

Returns the average of the values in the column.

Syntax: `Average(column)`

Example: `Average([Quantity])` would return the mean for the `Quantity` field.

### Count

Returns the count of rows (also known as records) in the selected data.

Syntax: `Count`

Example: `Count` If a table or result returns 10 rows, `Count` will return `10`.

### [CountIf](./expressions/countif.md)

Only counts rows where the condition is true.

Syntax: `CountIf(condition)`.

Example: `CountIf([Subtotal] > 100)` would return the number of rows where the subtotal were greater than 100.

### CumulativeCount

The additive total of rows across a breakout.

Syntax: `CumulativeCount`.

Example: `CumulativeCount`.

### CumulativeSum

The rolling sum of a column across a breakout.

Syntax: `CumulativeSum(column)`.

Example: `CumulativeSum([Subtotal])`.

Related: [Sum](#sum) and [SumIf](#sumif).

### Distinct

The number of distinct values in this column.

Syntax: `Distinct(column)`.

`Distinct([Last Name])`. Returns the count of unique last names in the column. Duplicates (of the last name "Smith" for example) are not counted.

### Max

Returns the largest value found in the column.

Syntax: `Max(column)`.

Example: `Max([Age])` would return the oldest age found across all values in the `Age` column.

Related: [Min](#min), [Average](#average), [Median](#median).

### Median

Returns the median value of the specified column.

Syntax: `Median(column)`.

Example: `Median([Age])` would find the midpoint age where half of the ages are older, and half of the ages are younger.

Databases that don't support `median`: MariaDB, MySQL, SQLite, Vertica, and SQL Server. Presto only provides approximate results.

Related: [Min](#min), [Max](#max), [Average](#average).

### Min

Returns the smallest value found in the column.

Syntax: `Min(column)`.

Example: `Min([Salary])` would find the lowest salary among all salaries in the `Salary` column.

Related: [Max](#max), [Median](#median), [Average](#average).

### Percentile

Returns the value of the column at the percentile value.

Syntax: `Percentile(column, percentile-value)`

Example: `Percentile([Score], 0.9)` would return the value at the 90th percentile for all values in that column.

Databases that don't support `percentile`: H2, MariaDB, MySQL, SQL Server, SQLite, Vertica. Presto only provides approximate results.

### Share

Returns the percent of rows in the data that match the condition, as a decimal.

Syntax: `Share(condition)`

Example: `Share([Color] = "Blue")` would return the number of rows with the `Color` field set to `Blue`, divided by the total number of rows.

### StandardDeviation

Calculates the standard deviation of the column, which is a measure of the variation in a set of values. Low standard deviation indicates values cluster around the mean, whereas a high standard deviation means the values are spread out over a wide range.

Syntax: `StandardDeviation(column)`

Example: `StandardDeviation([Population])` would return the SD for the values in the `Population` column.

### Sum

Adds up all the values of the column.

Syntax: `Sum(column)`

Example: `Sum([Subtotal])` would add up all the values in the `Subtotal` column.

### [SumIf](./expressions/sumif.md)

Sums up the specified column only for rows where the condition is true.

Syntax: `SumIf(column, condition)`.

Example:`SumIf([Subtotal], [Order Status] = "Valid")` would add up all the subtotals for orders with a status of "Valid".

### Variance

Returns the numeric variance for a given column.

Syntax: `Variance(column)`

Example: `Variance([Temperature])` will return a measure of the dispersion from the mean temperature for all temps in that column.

Related: [StandardDeviation](#standarddeviation), [Average](#average).

## Functions

Function expressions apply to each individual value. They can be used to alter or filter values in a column, or create new, custom columns.

## Logical functions

Logical functions determine if a condition is satisfied or determine what value to return based on a condition.

### between

Checks a date or number column's values to see if they're within the specified range.

Syntax: `between(column, start, end)`

Example: `between([Created At], "2019-01-01", "2020-12-31")` would return rows where `Created At` date fell within the range of January 1, 2019 and December 31, 2020.

Related: [interval](#interval).

### [case](./expressions/case.md)

Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.

Syntax: `case(condition, output, …)`

Example: `case([Weight] > 200, "Large", [Weight] > 150, "Medium", "Small")` If a `Weight` is 250, the expression would return "Large". In this case, the default value is "Small", so any `Weight` 150 or less would return "Small".

### [coalesce](./expressions/coalesce.md)

Looks at the values in each argument in order and returns the first non-null value for each row.

Syntax: `coalesce(value1, value2, …)`

Example: `coalesce([Comments], [Notes], "No comments")`. If both the `Comments` and `Notes` columns are null for that row, the expression will return the string "No comments".

### [isnull](./expressions/isnull.md)

Returns true if the column is null.

Syntax: `isnull(column)`

Example: `isnull([Tax])` would return true if no value were present in the column for that row.

Related: [notnull](#notnull), [isempty](#isempty)

### notnull

Returns true if the column contains a value.

Syntax: `notnull(column)`

Example: `notnull([Tax])` would return true if there is a value present in the column for that row.

Related: [isnull](#isnull), [notempty](#notempty)

## Math functions

Math functions implement common mathematical operations.

### abs

Returns the absolute (positive) value of the specified column.

Syntax: `abs(column)`

Example: `abs([Debt])`. If `Debt` were -100, `abs(-100)` would return `100`.

### ceil

Rounds a decimal up (ceil as in ceiling).

Syntax: `ceil(column)`.

Example: `ceil([Price])`. `ceil(2.99)` would return 3.

Related: [floor](#floor), [round](#round).

### exp

Returns [Euler's number](<https://en.wikipedia.org/wiki/E_(mathematical_constant)>), e, raised to the power of the supplied number. (Euler sounds like "Oy-ler").

Syntax: `exp(column)`.

Example: `exp([Interest Months])`

Related: [power](#power).

### floor

Rounds a decimal number down.

Syntax: `floor(column)`

Example: `floor([Price])`. If the `Price` were 1.99, the expression would return 1.

Related: [ceil](#ceil), [round](#round).

### log

Returns the base 10 log of the number.

Syntax: `log(column)`.

Example: `log([Value])`.

### power

Raises a number to the power of the exponent value.

Syntax: `power(column, exponent)`.

Example: `power([Length], 2)`. If the length were `3`, the expression would return `9` (3 to the second power is 3\*3).

Databases that don't support `power`: SQLite.

Related: [exp](#exp).

### round

Rounds a decimal number either up or down to the nearest integer value.

Syntax: `round(column)`.

Example: `round([Temperature])`. If the temp were `13.5` degrees centigrade, the expression would return `14`.

Example: `round([Temperature] * 10) / 10`. If the temp were `100.75`, the expression would return `100.8`.

### sqrt

Returns the square root of a value.

Syntax: `sqrt(column)`.

Example: `sqrt([Hypotenuse])`.

Databases that don't support `sqrt`: SQLite.

Related: [Power](#power).

## String functions

String functions manipulate or validate string data.

### [concat](./expressions/concat.md)

Combine two or more strings together.

Syntax: `concat(value1, value2, …)`

Example: `concat([Last Name], ", ", [First Name])` would produce a string of the format "Last Name, First Name", like "Palazzo, Enrico".

### contains

Checks to see if `string1` contains `string2` within it.

Performs case-sensitive match by default.
You can pass an optional parameter `"case-insensitive"` to perform a case-insensitive match.

Syntax: `contains(string1, string2)` for case-sensitive match.

`contains(string1, string2, "case-insensitive")` for case-insensitive match.

Example: `contains([Status], "Class")`.

If `Status` were "Classified", the expression would return `true`. If the `Status` were "**c**lassified", the expression would return `false`, because the case does not match.

Related: [doesNotContain](#doesnotcontain), [regexextract](#regexextract).

### doesNotContain

Checks to see if `string1` contains `string2` within it.

Performs case-sensitive match by default.
You can pass an optional parameter `"case-insensitive"` to perform a case-insensitive match.

Syntax: `doesNotContain(string1, string2)` for case-sensitive match.

`doesNotContain(string1, string2, "case-insensitive")` for case-insensitive match.

Example: `doesNotContain([Status], "Class")`. If `Status` were "Classified", the expression would return `false`.

Related: [contains](#contains), [regexextract](#regexextract).

### endsWith

Returns true if the end of the text matches the comparison text.

Performs case-sensitive match by default.
You can pass an optional parameter `"case-insensitive"` to perform a case-insensitive match.

Syntax: `endsWith(text, comparison)` for case-sensitive match.

`endsWith(text, comparison, "case-insensitive")` for case-insensitive match.

Example: `endsWith([Appetite], "hungry")`

Related: [startsWith](#startswith), [contains](#contains), [doesNotContain](#doesnotcontain).

### [isempty](./expressions/isempty.md)

Returns true if a _string column_ contains an empty string or is null. Calling this function on a non-string column will cause an error. You can use [isnull](#isnull) for non-string columns.

Syntax: `isempty(column)`

Example: `isempty([Feedback])` would return true if `Feedback` was an empty string (`''`) or did not contain a value.

Related: [notempty](#notempty), [isnull](#isnull)

### ltrim

Removes leading whitespace from a string of text.

Syntax: `ltrim(text)`

Example: `ltrim([Comment])`. If the comment were `" I'd prefer not to"`, `ltrim` would return `"I'd prefer not to"`.

Related: [trim](#trim) and [rtrim](#rtrim).

### length

Returns the number of characters in text.

Syntax: `length(text)`

Example: `length([Comment])`. If the `comment` were "wizard", `length` would return 6 ("wizard" has six characters).

### lower

Returns the string of text in all lower case.

Syntax: `lower(text)`.

Example: `lower([Status])`. If the `Status` were "QUIET", the expression would return "quiet".

Related: [upper](#upper).

### notempty

Returns true if a _string column_ contains a value that is not the empty string. Calling this function on a non-string column will cause an error. You can use [notnull](#notnull) on non-string columns.

Syntax: `notempty(column)`

Example: `notempty([Feedback])` would return true if `Feedback` contains a value that isn't the empty string (`''`).

Related: [isempty](#isempty), [isnull](#isnull), [notnull](#notnull)

### [regexextract](./expressions/regexextract.md)

> ⚠️ `regexextract` is unavailable for MongoDB, SQLite, and SQL Server. For Druid, `regexextract` is only available for the Druid-JDBC driver.

Extracts matching substrings according to a regular expression.

Syntax: `regexextract(text, regular_expression)`.

Example: `regexextract([Address], "[0-9]+")`.

Databases that don't support `regexextract`: H2, SQL Server, SQLite.

Related: [contains](#contains), [doesNotContain](#doesnotcontain), [substring](#substring).

### replace

Replaces all occurrences of a search text in the input text with the replacement text.

Syntax: `replace(text, find, replace)`.

Example: `replace([Title], "Enormous", "Gigantic")`.

### rtrim

Removes trailing whitespace from a string of text.

Syntax: `rtrim(text)`

Example: `rtrim([Comment])`. If the comment were "Fear is the mindkiller. ", the expression would return "Fear is the mindkiller."

Related: [trim](#trim) and [ltrim](#ltrim).

### startsWith

Returns true if the beginning of the text matches the comparison text. Performs case-sensitive match by default.
You can pass an optional parameter `"case-insensitive"` to perform a case-insensitive match.

Syntax: `startsWith(text, comparison)` for case-sensitive match.

`startsWith(text, comparison, "case-insensitive")` for case-insensitive match.

Example: `startsWith([Course Name], "Computer Science")` would return true for course names that began with "Computer Science", like "Computer Science 101: An introduction".

It would return false for "Computer **s**cience 201: Data structures" because the case of "science" does not match the case in the comparison text.

`startsWith([Course Name], "Computer Science", "case-insensitive")` would return true for both "Computer Science 101: An introduction" and "Computer science 201: Data structures".

Related: [endsWith](#endswith), [contains](#contains), [doesNotContain](#doesnotcontain).

### [substring](./expressions/substring.md)

Returns a portion of the supplied text, specified by a starting position and a length.

Syntax: `substring(text, position, length)`

Example: `substring([Title], 1, 10)` returns the first 10 letters of a string (the string index starts at position 1).

Related: [regexextract](#regexextract), [replace](#replace).

### trim

Removes leading and trailing whitespace from a string of text.

Syntax: `trim(text)`

Example: `trim([Comment])` will remove any whitespace characters on either side of a comment.

### upper

Returns the text in all upper case.

Syntax: `upper(text)`.

Example: `upper([Status])`. If status were "hyper", `upper("hyper")` would return "HYPER".

## Date functions

Date functions manipulate, extract, or create date and time values.

### [convertTimezone](./expressions/converttimezone.md)

Shifts a date or timestamp value into a specified time zone.

Syntax: `convertTimezone(column, target, source)`.

Example: `convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")` would return the value `2022-12-28T09:00:00`, displayed as `December 28, 2022, 9:00 AM`.

See the [database limitations](./expressions/converttimezone.md#limitations) for `convertTimezone`.

### [datetimeAdd](./expressions/datetimeadd.md)

Adds some unit of time to a date or timestamp value.

Syntax: `datetimeAdd(column, amount, unit)`.

Example: `datetimeAdd("2021-03-25", 1, "month")` would return the value `2021-04-25`, displayed as `April 25, 2021`.

`amount` must be an integer, not a fractional number. For example, you cannot add "half a year" (0.5).

Related: [between](#between), [datetimeSubtract](#datetimesubtract).

### [datetimeDiff](./expressions/datetimediff.md)

Returns the difference between two datetimes in some unit of time. For example, `datetimeDiff(d1, d2, "day") ` will return the number of days between `d1` and `d2`.

Syntax: `datetimeDiff(datetime1, datetime2, unit)`.

Example: `datetimeDiff("2022-02-01", "2022-03-01", "month")` would return `1`.

### [datetimeSubtract](./expressions/datetimesubtract.md)

Subtracts some unit of time from a date or timestamp value.

Syntax: `datetimeSubtract(column, amount, unit)`.

Example: `datetimeSubtract("2021-03-25", 1, "month")` would return the value `2021-02-25`, displayed as `February 25, 2021`.

`amount` must be an integer, not a fractional number. For example, you cannot subtract "half a year" (0.5).

Related: [between](#between), [datetimeAdd](#datetimeadd).

### day

Takes a datetime and returns the day of the month as an integer.

Syntax: `day([datetime column])`.

Example: `day("2021-03-25T12:52:37")` would return the day as an integer, `25`.

### hour

Takes a datetime and returns the hour as an integer (0-23).

Syntax: `hour([datetime column])`.

Example: `hour("2021-03-25T12:52:37")` would return `12`.

### interval

Checks a date column's values to see if they're within the relative range.

Syntax: `interval(column, number, text)`.

Example: `interval([Created At], -1, "month")`.

The `number` must be an integer. You cannot use a fractional value.

Related: [between](#between).

### minute

Takes a datetime and returns the minute as an integer (0-59).

Syntax: `minute([datetime column])`.

Example: `minute("2021-03-25T12:52:37")` would return `52`.

### month

Takes a datetime and returns the month number (1-12) as an integer.

Syntax: `month([datetime column])`.

Example: `month("2021-03-25T12:52:37")` would return the month as an integer, `3`.

### [now](./expressions/now.md)

Returns the current date and time using your Metabase [report timezone](../../configuring-metabase/localization.md#report-timezone).

Syntax: `now`.

### quarter

Takes a datetime and returns the number of the quarter in a year (1-4) as an integer.

Syntax: `quarter([datetime column])`.

Example: `quarter("2021-03-25T12:52:37")` would return `1` for the first quarter.

### relativeDateTime

Gets a timestamp relative to the current time.

Syntax: `relativeDateTime(number, text)`

`number`: Period of interval, where negative values are back in time. The `number` must be an integer. You cannot use a fractional value.

`text`: Type of interval like `"day"`, `"month"`, `"year"`

`relativeDateTime` can only be used as part of a conditional expression.

Example: `[Orders → Created At] < relativeDateTime(-30, "day")` will filter for orders created over 30 days ago from current date.

Related: [datetimeAdd](#datetimeadd), [datetimeSubtract](#datetimesubtract).

### second

Takes a datetime and returns the number of seconds in the minute (0-59) as an integer.

Syntax: `second([datetime column])`.

Example: `second("2021-03-25T12:52:37")` would return the integer `37`.

### timeSpan

Gets a time interval of specified length.

Syntax: `timeSpan(number, text)`.

`number`: Period of interval, where negative values are back in time. The `number` must be an integer. You cannot use a fractional value.

`text`: Type of interval like `"day"`, `"month"`, `"year"`

Example: `[Orders → Created At] + timeSpan(7, "day")` will return the date 7 days after the `Created At` date.

### week

Takes a datetime and returns the week as an integer.

Syntax: `week(column, mode)`.

Example: `week("2021-03-25T12:52:37")` would return the week as an integer, `12`.

- column: the name of the column of the date or datetime value.
- mode: Optional.
  - ISO: (default) Week 1 starts on the Monday before the first Thursday of January.
  - US: Week 1 starts on Jan 1. All other weeks start on Sunday.
  - Instance: Week 1 starts on Jan 1. All other weeks start on the day defined in your Metabase localization settings.

### weekday

Takes a datetime and returns an integer (1-7) with the number of the day of the week.

Syntax: `weekday(column)`

- column: The datetime column.

Example:

```
case(
  weekday([Created At]) = 1, "Sunday",
  weekday([Created At]) = 2, "Monday",
  weekday([Created At]) = 3, "Tuesday",
  weekday([Created At]) = 4, "Wednesday",
  weekday([Created At]) = 5, "Thursday",
  weekday([Created At]) = 6, "Friday",
  weekday([Created At]) = 7, "Saturday")
```

### year

Takes a datetime and returns the year as an integer.

Syntax: `year([datetime column])`.

Example: `year("2021-03-25T12:52:37")` would return the year 2021 as an integer, `2,021`.

## Window functions

### Offset

> ⚠️ The `Offset` function is currently unavailable for MySQL/MariaDB.

Returns the value of an expression in a different row. `Offset` can only be used in the query builder's Summarize step (you cannot use `Offset` to create a custom column).

Syntax: `Offset(expression, rowOffset)`

The `expression` is the value to get from a different row.

The `rowOffset` is the number relative to the current row. For example, `-1` for the previous row, or `1` for the next row.

Example: `Offset(Sum([Total]), -1)` would get the `Sum([Total])` value from the previous row.

See [Offset](./expressions/offset.md).

## Limitations

- [Aggregation expressions](#aggregations) can only be used in the **Summarize** section of the query builder.
- Functions that return a boolean value, like [isempty](#isempty) or [contains](#contains), cannot be used to create a custom column. To create a custom column based on one of these functions, you must combine them with another function, like `case`.

  For example, to create a new custom column that contains `true` if `[Title]` contain `'Wallet'`, you can use the custom expression

  ```
  case(contains([Title], 'Wallet'), true, false)
  ```

## Database limitations

Limitations are noted for each aggregation and function above, and here there are in summary:

**H2** (including Metabase Sample Database): `Median`, `Percentile`, `convertTimezone` and `regexextract`

**Druid**: `regexextract` is only available for the Druid-JDBC driver.

**MongoDB**: `regexextract`

**MariaDB**: `Median`, `Percentile`.

**MySQL**: `Median`, `Percentile`.

**Presto**: Only provides _approximate_ results for `Median` and `Percentile`.

**SQL Server**: `Median`, `Percentile` and `regexextract`

**SQLite**: `log`, `Median`, `Percentile`, `power`, `regexextract`, `StandardDeviation`, `sqrt` and `Variance`

**Vertica**: `Median` and `Percentile`

If you're using or maintaining a third-party database driver, please [refer to the wiki](https://github.com/metabase/metabase/wiki/What's-new-in-0.35.0-for-Metabase-driver-authors) to see how your driver might be impacted.

Check out our tutorial on [custom expressions in the query builder](https://www.metabase.com/learn/questions/custom-expressions) to learn more.

[expressions]: ./expressions.md
