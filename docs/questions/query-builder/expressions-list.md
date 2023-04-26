---
title: List of expressions
redirect_from:
  - /docs/latest/users-guide/expressions-list
---

# List of expressions

For an introduction to expressions, check out [Writing expressions in the notebook editor][expressions].

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
- [Functions](#functions)
  - [abs](#abs)
  - [between](#between)
  - [case](./expressions/case.md)
  - [ceil](#ceil)
  - [coalesce](./expressions/coalesce.md)
  - [concat](./expressions/concat.md)
  - [contains](#contains)
  - [convertTimezone](./expressions/converttimezone.md)
  - [datetimeAdd](./expressions/datetimeadd.md)
  - [datetimeDiff](./expressions/datetimediff.md)
  - [datetimeSubtract](./expressions/datetimesubtract.md)
  - [day](#day)
  - [endswith](#endswith)
  - [exp](#exp)
  - [floor](#floor)
  - [hour](#hour)
  - [interval](#interval)
  - [isempty](./expressions/isempty.md)
  - [isnull](./expressions/isnull.md)
  - [lefttrim](#lefttrim)
  - [length](#length)
  - [log](#log)
  - [lower](#lower)
  - [minute](#minute)
  - [month](#month)
  - [now](./expressions/now.md)
  - [power](#power)
  - [quarter](#quarter)
  - [regexextract](./expressions/regexextract.md)
  - [replace](#replace)
  - [righttrim](#righttrim)
  - [round](#round)
  - [second](#second)
  - [sqrt](#sqrt)
  - [startswith](#startswith)
  - [substring](./expressions/substring.md)
  - [trim](#trim)
  - [upper](#upper)
  - [week](#week)
  - [year](#year)
- [Database limitations](#database-limitations)

## Aggregations

Aggregation expressions take into account all values in a field. They can only be used in the **Summarize** section of the notebook editor.

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

Databases that don't support `median`: SQLite, Vertica, SQL server, MySQL. Presto only provides approximate results.

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

Databases that don't support `percentile`: H2, MySQL, SQL Server, SQLite, Vertica. Presto only provides approximate results.

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

### abs

Returns the absolute (positive) value of the specified column.

Syntax: `abs(column)`

Example: `abs([Debt])`. If `Debt` were -100, `abs(-100)` would return `100`.

### between

Checks a date or number column's values to see if they're within the specified range.

Syntax: `between(column, start, end)`

Example: `between([Created At], "2019-01-01", "2020-12-31")` would return rows where `Created At` date fell within the range of January 1, 2019 and December 31, 2020.

Related: [interval](#interval).

### [case](./expressions/case.md)

Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.

Syntax: `case(condition, output, …)`

Example: `case([Weight] > 200, "Large", [Weight] > 150, "Medium", "Small")` If a `Weight` is 250, the expression would return "Large". In this case, the default value is "Small", so any `Weight` 150 or less would return "Small".

### ceil

Rounds a decimal up (ceil as in ceiling).

Syntax: `ceil(column)`.

Example: `ceil([Price])`. `ceil(2.99)` would return 3.

Related: [floor](#floor), [round](#round).

### [coalesce](./expressions/coalesce.md)

Looks at the values in each argument in order and returns the first non-null value for each row.

Syntax: `coalesce(value1, value2, …)`

Example: `coalesce([Comments], [Notes], "No comments")`. If both the `Comments` and `Notes` columns are null for that row, the expression will return the string "No comments".

### [concat](./expressions/concat.md)

Combine two or more strings together.

Syntax: `concat(value1, value2, …)`

Example: `concat([Last Name], ", ", [First Name])` would produce a string of the format "Last Name, First Name", like "Palazzo, Enrico".

### contains

Checks to see if string1 contains string2 within it.

Syntax: `contains(string1, string2)`

Example: `contains([Status], "Class")`. If `Status` were "Classified", the expression would return `true`.

Related: [regexextract](#regexextract).

### [convertTimezone](./expressions/converttimezone.md)

Shifts a date or timestamp value into a specified time zone.

Syntax: `convertTimezone(column, target, source)`.

Example: `convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")` would return the value `2022-12-28T09:00:00`, displayed as `December 28, 2022, 9:00 AM`.

### [datetimeAdd](./expressions/datetimeadd.md)

Adds some unit of time to a date or timestamp value.

Syntax: `datetimeAdd(column, amount, unit)`.

Example: `datetimeAdd("2021-03-25", 1, "month")` would return the value `2021-04-25`, displayed as `April 25, 2021`.

Related: [between](#between), [datetimeSubtract](#datetimesubtract).

### [datetimeDiff](./expressions/datetimediff.md)

Returns the difference between two datetimes in some unit of time. For example, `datetimeDiff(d1, d2, "day") ` will return the number of days between `d1` and `d2`.

Syntax: `datetimeDiff(datetime1, datetime2, unit)`.

Example: `datetimeDiff("2022-02-01", "2022-03-01", "month")` would return `1`.

### [datetimeSubtract](./expressions/datetimesubtract.md)

Subtracts some unit of time from a date or timestamp value.

Syntax: `datetimeSubtract(column, amount, unit)`.

Example: `datetimeSubtract("2021-03-25", 1, "month")` would return the value `2021-02-25`, displayed as `February 25, 2021`.

Related: [between](#between), [datetimeAdd](#datetimeadd).

### day

Takes a datetime and returns the day of the month as an integer.

Syntax: `day([datetime column])`.

Example: `day("2021-03-25T12:52:37")` would return the day as an integer, `25`.

### endswith

Returns true if the end of the text matches the comparison text.

Syntax: `endsWith(text, comparison)`

`endsWith([Appetite], "hungry")`

Related: [contains](#contains) and [startswith](#startswith).

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

### hour

Takes a datetime and returns the hour as an integer (0-23).

Syntax: `hour([datetime column])`.

Example: `hour("2021-03-25T12:52:37")` would return `12`.

### interval

Checks a date column's values to see if they're within the relative range.

Syntax: `interval(column, number, text)`.

Example: `interval([Created At], -1, "month")`.

Related: [between](#between).

### [isempty](./expressions/isempty.md)

Returns true if the column is empty.

Syntax: `isempty(column)`

Example: `isempty([Discount])` would return true if there were no value in the discount field.

### [isnull](./expressions/isnull.md)

Returns true if the column is null.

Syntax: `isnull(column)`

Example: `isnull([Tax])` would return true if no value were present in the column for that row.

### lefttrim

Removes leading whitespace from a string of text.

Syntax: `ltrim(text)`

Example: `ltrim([Comment])`. If the comment were " I'd prefer not to", `ltrim` would return "I'd prefer not to".

Related: [trim](#trim) and [righttrim](#righttrim).

### length

Returns the number of characters in text.

Syntax: `length(text)`

Example: `length([Comment])` If the `comment` were "wizard", `length` would return 6 ("wizard" has six characters).

### log

Returns the base 10 log of the number.

Syntax: `log(column)`.

Example: `log([Value])`.

### lower

Returns the string of text in all lower case.

Syntax: `lower(text)`.

Example: `lower([Status])`. If the `Status` were "QUIET", the expression would return "quiet".

Related: [upper](#upper).

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

### power

Raises a number to the power of the exponent value.

Syntax: `power(column, exponent)`.

Example: `power([Length], 2)`. If the length were `3`, the expression would return `9` (3 to the second power is 3\*3).

Databases that don't support `power`: SQLite.

Related: [exp](#exp).

### quarter

Takes a datetime and returns the number of the quarter in a year (1-4) as an integer.

Syntax: `quarter([datetime column])`.

Example: `quarter("2021-03-25T12:52:37")` would return `1` for the first quarter.

### [regexextract](./expressions/regexextract.md)

Extracts matching substrings according to a regular expression.

Syntax: `regexextract(text, regular_expression)`.

Example: `regexextract([Address], "[0-9]+")`.

Databases that don't support `regexextract`: H2, SQL Server, SQLite.

Related: [contains](#contains), [substring](#substring).

### replace

Replaces all occurrences of a search text in the input text with the replacement text.

Syntax: `replace(text, find, replace)`.

Example: `replace([Title], "Enormous", "Gigantic")`.

### righttrim

Removes trailing whitespace from a string of text.

Syntax: `rtrim(text)`

Example: `rtrim([Comment])`. If the comment were "Fear is the mindkiller. ", the expression would return "Fear is the mindkiller."

Related: [trim](#trim) and [lefttrim](#lefttrim).

### round

Rounds a decimal number either up or down to the nearest integer value.

Syntax: `round(column)`.

Example: `round([Temperature])`. If the temp were `13.5` degrees centigrade, the expression would return `14`.

### second

Takes a datetime and returns the number of seconds in the minute (0-59) as an integer.

Syntax: `second([datetime column)`.

Example: `second("2021-03-25T12:52:37")` would return the integer `37`.

### sqrt

Returns the square root of a value.

Syntax: `sqrt(column)`.

Example: `sqrt([Hypotenuse])`.

Databases that don't support `sqrt`: SQLite.

Related: [Power](#power).

### startswith

Returns true if the beginning of the text matches the comparison text.

Syntax: `startsWith(text, comparison)`.

Example: `startsWith([Course Name], "Computer Science")` would return true for course names that began with "Computer Science", like "Computer Science 101: An introduction".

Related: [endswith](#endswith), [contains](#contains).

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

### week

Takes a datetime and returns the week as an integer.

Syntax: `week(column, mode)`.

Example: `week("2021-03-25T12:52:37")` would return the week as an integer, `12`.

- column: the name of the column of the date or datetime value.
- mode: Optional.
  - ISO: (default) Week 1 starts on the Monday before the first Thursday of January.
  - US: Week 1 starts on Jan 1. All other weeks start on Sunday.
  - Instance: Week 1 starts on Jan 1. All other weeks start on the day defined in your Metabase localization settings.

### year

Takes a datetime and returns the year as an integer.

Syntax: `year([datetime column])`.

Example: `year("2021-03-25T12:52:37")` would return the year 2021 as an integer, `2,021`.

## Database limitations

Limitations are noted for each aggregation and function above, and here there are in summary:

**H2**: `Median`, `Percentile` and `regexextract`

**MySQL/MariaDB**: `Median`, `Percentile`.

**SQL Server**: `Median`, `Percentile` and `regexextract`

**SQLite**: `log`, `Median`, `Percentile`, `power`, `regexextract`, `StandardDeviation`, `sqrt` and `Variance`

**Vertica**: `Median` and `Percentile`

Additionally, **Presto** only provides _approximate_ results for `Median` and `Percentile`.

If you're using or maintaining a third-party database driver, please [refer to the wiki](https://github.com/metabase/metabase/wiki/What's-new-in-0.35.0-for-Metabase-driver-authors) to see how your driver might be impacted.

See [Custom expressions in the notebook editor](https://www.metabase.com/learn/questions/custom-expressions) to learn more.

[expressions]: ./expressions.md
