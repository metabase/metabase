## Writing expressions in the notebook editor

[Custom expressions](https://www.metabase.com/blog/custom-expressions/index.html) are a way to create more advanced filters and aggregations, or to add custom columns to your custom question. These expressions are accessible in the notebook editor of custom questions when clicking the button to add a new filter, a new metric in the Summarize area, or when creating a new custom column.

### How to write expressions

In each of these three places, you can:

- Use parentheses to group parts of your expression.
- Use basic mathematical operators: `+`, `-`, `*` (multiply), `/` (divide) on numeric column with numeric values, like integers, floats, and doubles. You can't currently do math on timestamp columns.
- Use conditional operators: `AND`, `OR`, `NOT`, `>`, `>=` (greater than or equal to), `<`, `<=` (less than or equal to), `=`, `!=` (not equal to).
- Refer to columns in the current table, or columns that are linked via a foreign key relationship. Column names should be included inside of square brackets, like this: `[Name of Column]`. Columns in connected tables can be referred to like this: `[ConnectedTableName.Column]`.
- Refer to saved [Segments or Metrics](../administration-guide/07-segments-and-metrics.md) that are present in the currently selected table. You write these out the same as with columns, like this: `[Valid User Sessions]`.
- Use most of the different functions listed below.

### Aggregation functions

Some of the functions listed below can only be used inside of a metric expression in the Summarize area, because they aggregate an entire column. So while you could create a custom column with the formula `[Subtotal] + [Tax]`, you could _not_ write `Sum([Subtotal] + [Tax])` unless you were creating a custom metric expression. Here are the functions that can only be used when writing a metric expression:

- Average
- Count
- CumulativeCount
- CumulativeSum
- Distinct
- Max
- Median
- Min
- Percentile
- StandardDeviation
- Sum
- Variance

### Filter expressions and conditionals

Some other things to keep in mind about filter expressions and conditionals:

- Filter expressions are different in that they must return something that's true or false. E.g., you could write `[Subtotal] + [Tax] < 100`, but not just `[Subtotal] + [Tax]`.
- You can use functions inside of the conditional portion of the `countif` and `sumif` aggregations, like so: `countif( round([Subtotal]) > 100 OR floor([Tax]) < 10 )`

### Working with dates in filter expressions

If you want to work with dates in your filter expressions, they'll need to follow the format, `"YYYY-MM-DD"` — i.e., four characters for the year, two for the month, and two for the day, enclosed in quotes and separated by dashes.

Example:

`between([Created At], "2020-01-01", "2020-03-31") OR [Received At] > "2019-12-25"`

This would return rows where `Created At` is between January 1, 2020 and March 31, 2020, or where `Received At` is after December 25, 2019.

## Types of expressions

There are two basic types of expressions, Aggregations and Functions. Aggregations take values from multiple rows to perform a calculation, such as finding the average value from all values in a column. Functions, by contrast, do something to each value in a column, like searching for a word in each value, rounding each value up (the `ceil` function), and so on.

## Aggregations

### Average

Returns the average of the values in the column.

Syntax: `Average(column)`

Example: `Average([Quantity])` would return the mean for the `Quantity` field.

### Count

Returns the count of rows (also known as records) in the selected data.

Syntax: `Count`

Example: `Count` If a table or result returns 10 rows, `Count` will return `10`.

### CountIf

Only counts rows where the condition is true.

Syntax: `CountIf(condition)`.

Example: `CountIf([Subtotal] > 100)` would return the number of rows where the subtotal were greater than 100.

### Cumulative count

The additive total of rows across a breakout.

Syntax: `CumulativeCount`.

Example: `CumulativeCount`. 
                                                 |
### Distinct

The number of distinct values in this column.

Syntax: `Distinct(column)`.

`Distinct([Last Name])`. Returns the count of unique last names in the column. Duplicates (of the last name "Smith" for example) are not counted.

### Share

Syntax: `Share(condition)`

Example: `Share([Color] = "Blue")` would return the number of rows with the `Color` field set to `Blue`, divided by the total number of rows.

Returns the percent of rows in the data that match the condition, as a decimal.

### Standard deviation

Calculates the standard deviation of the column, which is a measure of the variation in a set of values. Low standard deviation indicates values cluster around the mean, whereas a high standard deviation means the values are spread out over a wide range.

Syntax: `StandardDeviation(column)`

Example: `StandardDeviation([Population])` would return the SD for the values in the `Population` column. 

### Sum

Adds up all the values of the column.

Syntax: `Sum(column)`

Example: `Sum([Subtotal])` would add up all the values in the `Subtotal` column.

### Sum if
 
Sums up the specified column only for rows where the condition is true.

Syntax: `SumIf(column, condition)`.

Example:`SumIf([Subtotal], [Order Status] = "Valid")` would add up all the subtotals for orders with a status of "Valid".

## Functions
 
### Abs

Returns the absolute (positive) value of the specified column.                                                        |
 
Syntax: `abs(column)` 

Example: `abs([Debt])`. If `Debt` were -100, `abs(-100)` would return `100`.

Databases that don't support `abs`: BigQuery.

### Between

Checks a date or number column's values to see if they're within the specified range.

Syntax: `between(column, start, end)`

Example: `between([Created At], "2019-01-01", "2020-12-31")` would return rows where `Created At` date fell within the range of January 1, 2019 and December 31, 2020.   

### Case

Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.

Syntax: `case(condition, output, …)`

Example: `case([Weight] > 200, "Large", [Weight] > 150, "Medium", "Small")` If a `Weight` is 250, the expression would return "Large". In this case, the default value is "Small", so any `Weight` 150 or less would return "Small".

## Ceil

Rounds a decimal up (ciel as in ceiling).

Syntax: `ceil(column)`.

Example: `ceil([Price])`. `ceil(2.99)` would return 3.

See also [Floor](#floor)

### Coalesce

Looks at the values in each argument in order and returns the first non-null value for each row.

Syntax: `coalesce(value1, value2, …)`

Example: `coalesce([Comments], [Notes], "No comments")`. If both the `Comments` and `Notes` columns are null for that row, the expression will return the string "No comments".

### Concat

Combine two or more strings together.

Syntax: `concat(value1, value2, …)`

Example: `concat([Last Name], ", ", [First Name])` would produce a string of the format "Last Name, First Name", like "Palazzo, Enrico".

### Contains

Checks to see if string1 contains string2 within it.

Syntax: `contains(string1, string2)`

Example: `contains([Status], "Class")`. If `Status` were "Classified", the expression would return `true`.

### Ends with

Returns true if the end of the text matches the comparison text.  

Syntax: `endsWith(text, comparison)`

`endsWith([Appetite], "hungry")`

See also [Contains](#contains) and [Starts with](#starts-with).

### Exp

Returns [Euler's number](https://en.wikipedia.org/wiki/E_(mathematical_constant), e, raised to the power of the supplied number. (Euler sounds like "Oiler").

Syntax: `exp(column)`.

Example: `exp([Interest Months])` 

### Floor

Rounds a decimal number down.                                                                                                                                      

Syntax: `floor(column)`

Example: `floor([Price])`. If the `Price` were 1.99, the expression would return 1.

See also [ceil](#ceil).
                                                   |
### Left trim

Removes leading whitespace from a string of text.       

Syntax: `ltrim(text)`

Example: `ltrim([Comment])`. If the comment were "    I'd prefer not to", `ltrim` would return "I'd prefer not to".

See also [Trim](#trim) and [Right trim](#right-trim).

### Length

Syntax: `length(text)`

Returns the number of characters in text.

Example: `length([Comment])` If the `comment` were "wizard", `length` would return 6 ("wizard" has six characters).                                               |

### Right Trim

Removes trailing whitespace from a string of text.

Syntax: `rtrim(text)` 

Example: `rtrim([Comment])`. If the comment were "Fear is the mindkiller.   ", the expression would return "Fear is the mindkiller."

See also [Trim](#trim) and [Left trim](#left-trim).

### Starts with

Returns true if the beginning of the text matches the comparison text.

Syntax: `startsWith(text, comparison)`

Example: `startsWith([Course Name], "Computer Science")`

### Substring

Returns a portion of the supplied text, specified by a starting position and a length.

Syntax: `substring(text, position, length)`

Example: `substring([Title], 0, 10)` returns the first 11 letters of a string (the string index starts at position 0).   

### Trim

Removes leading and trailing whitespace from a string of text.

Syntax: `trim(text)`

Example: `trim([Comment])` will remove any whitespace characters on either side of a comment.

### Upper

Returns the text in all upper case. 

Syntax: `upper(text)`

Example: `upper([Status])`


| Name               | Syntax                                   | Description                                                                                                                                                        | Example                                                            |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Cumulative sum     | `CumulativeSum(column)`                  | The rolling sum of a column across a breakout.                                                                                                                     | `CumulativeSum([Subtotal])`                                        |
| Interval           | `interval(column, number, text)`         | Checks a date column's values to see if they're within the relative range.                                                                                         | `interval([Created At], -1, "month")`                              |
| IsEmpty            | `isempty(column)`                        | Returns true if the column is empty.                                                                                                                               | `isempty([Discount])`                                              |
| IsNull             | `isnull(column)`                         | Returns true if the column is null.                                                                                                                                | `isnull([Tax])`                                                    |
| Log                | `log(column)`                            | Returns the base 10 log of the number.                                                                                                                             | `log([Value])`                                                     |
| Lower              | `lower(text)`                            | Returns the string of text in all lower case.                                                                                                                      | `lower([Status])`                                                  |
| Max                | `Max(column)`                            | Returns the largest value found in the column.                                                                                                                     | `Max([Age])`                                                       |
| Median             | `Median(column)`                         | Returns the median value of the specified column.                                                                                                                  | `Median([Age])`                                                    |
| Minimum            | `Min(column)`                            | Returns the smallest value found in the column                                                                                                                     | `Min([Salary])`                                                    |
| Percentile         | `Percentile(column, percentile-value)`   | Returns the value of the column at the percentile value.                                                                                                           | `Percentile([Score], 0.9)`                                         |
| Power              | `power(column, exponent)`                | Raises a number to the power of the exponent value.                                                                                                                | `power([Length], 2)`                                               |
| Regex extract      | `regexextract(text, regular_expression)` | Extracts matching substrings according to a regular expression.                                                                                                    | `regexextract([Address], "[0-9]+")`                                |
| Replace            | `replace(text, find, replace)`           | Replaces a part of the input text with new text.                                                                                                                   | `replace([Title], "Enormous", "Gigantic")`                         |
| Round              | `round(column)`                          | Rounds a decimal number either up or down to the nearest integer value.                                                                                            | `round([Temperature])`                                             |
| Square root        | `sqrt(column)`                           | Returns the square root.                                                                                                                                           | `sqrt([Hypotenuse])`                                               |
| Variance           | `Variance(column)`                       | Returns the numeric variance for a given column.                                                                                                                   | `Variance([Temperature])`                                          |

### Database limitations

Certain database types don't support some of the above functions:

**BigQuery**: `abs`, `ceil`, `floor`, `median`, `percentile` and `round`

**H2**: `median`, `percentile` and `regexextract`

**MySQL**: `median`, `percentile` and `regexextract`

**SQL Server**: `median`, `percentile` and `regexextract`

**SQLite**: `log`, `median`, `percentile`, `power`, `regexextract`, `standardDeviation`, `sqrt` and `variance`

**Vertica**: `median` and `percentile`

Additionally, **Presto** only provides _approximate_ results for `median` and `percentile`.

If you're using or maintaining a third-party database driver, please [refer to the wiki](https://github.com/metabase/metabase/wiki/What's-new-in-0.35.0-for-Metabase-driver-authors) to see how your driver might be impacted.


See [Custom expressions in the notebook editor](https://www.metabase.com/blog/custom-expressions/index.html) to learn more.
