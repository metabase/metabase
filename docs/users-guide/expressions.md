## Writing expressions in the notebook editor

Custom expressions are a way to create more advanced filters and aggregations, or to add custom columns to your custom question. These expressions are accessible in the notebook editor of custom questions when clicking the button to add a new filter, a new metric in the Summarize area, or when creating a new custom column.

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

### List of all available functions for expressions

| Name               | Syntax                                         | Description                                                                                                                                                        | Example                                                              |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Average            | `average(column)`                              | Returns the average of the values in the column.                                                                                                                   | `avg( [Quantity] )`                                                  |
| Between            | `between(column, start, end)`                  | Checks a date or number column's values to see if they're within the specified range.                                                                              | `between( [Rating], 3.75, 5 )`                                       |
| Case               | `case(condition, output, condition, output …)` | Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met. | `case( [Weight] > 200, "Large", [Weight] > 150, "Medium", "Small" )` |
| Ceiling            | `ceil(number)`                                 | Rounds a decimal number up.                                                                                                                                        | `ceil([Price])`                                                      |
| Coalesce           | `coalesce( value1, value2, …)`                 | Looks at the values in each argument in order and returns the first non-null value for each row.                                                                   | `coalesce( [Comments], [Notes], "No comments"` )                     |
| Concatenate        | `concat(value1, value2, …)`                    | Combine two or more strings of text together.                                                                                                                      | `concat([Last Name] , ", ", [First Name])`                           |
| Contains           | `contains(string1, string2)`                   | Checks to see if string1 contains string2 within it.                                                                                                               | `contains([Status], "Pass")`                                         |
| Count              | `count`                                        | Returns the count of rows in the selected data.                                                                                                                    | `count`                                                              |
| Count if           | `countif(condition)`                           | Only counts rows where the condition is true.                                                                                                                      | `countif( [Subtotal] > 100 )`                                        |
| Cumulative count   | `CumulativeCount`                              | The additive total of rows across a breakout.                                                                                                                      | `CumulativeCount`                                                    |
| Cumulative sum     | `CumulativeSum(column)`                        | The rolling sum of a column across a breakout.                                                                                                                     | `CumulativeSum( [Subtotal] )`                                        |
| Distinct           | `distinct(column)`                             | The number of distinct values in this column.                                                                                                                      | `distinct( [Last Name] )`                                            |
| Ends with          | `endsWith(text, comparison)`                   | Returns true if the end of the text matches the comparison text.                                                                                                   | `endsWith( [Appetite], "hungry" )`                                   |
| Exp                | `exp(number)`                                  | Returns Euler's number, e, raised to the power of the supplied number.                                                                                             | `exp([Interest Months])`                                             |
| Floor              | `floor(number)`                                | Rounds a decimal number down.                                                                                                                                      | `floor([Price])`                                                     |
| Length             | `length(text)`                                 | Returns the number of characters in text.                                                                                                                          | `length([Comment])`                                                  |
| Log                | `log(number)`                                  | Returns the base 10 log of the number.                                                                                                                             | `log([Value])`                                                       |
| Lower              | `lower(text)`                                  | Returns the string of text in all lower case.                                                                                                                      | `lower( [Status] )`                                                  |
| Left trim          | `ltrim(text)`                                  | Removes leading whitespace from a string of text.                                                                                                                  | `ltrim( [Comment] )`                                                 |
| Max                | `max(column)`                                  | Returns the largest value found in the column.                                                                                                                     | `max( [Age] )`                                                       |
| Median             | `median(column)`                               | Returns the median value of the specified column.                                                                                                                  | `median([Age])`                                                      |
| Minimum            | `min(column)`                                  | Returns the smallest value found in the column                                                                                                                     | `min( [Salary] )`                                                    |
| Percentile         | `percentile(column, percentile-value)`         | Returns the value of the column at the percentile value.                                                                                                           | `percentile([Score], 0.9)`                                           |
| Power              | `power(number, exponent)`                      | Raises a number to the power of the exponent value.                                                                                                                | `power([Length], 2)`                                                 |
| Regex extract      | `regexextract(text, regular_expression)`       | Extracts matching substrings according to a regular expression.                                                                                                    | `regexextract( [Address], "[0-9]+" )`                                |
| Replace            | `replace(text, find, replace)`                 | Replaces a part of the input text with new text.                                                                                                                   | `replace( [Title], "Enormous", "Gigantic" )`                         |
| Round              | `round(number)`                                | Rounds a decimal number either up or down to the nearest integer value.                                                                                            | `round([Temperature])`                                               |
| Right trim         | `rtrim(text)`                                  | Removes trailing whitespace from a string of text.                                                                                                                 | `rtrim( [Comment] )`                                                 |
| Share              | `share(condition)`                             | Returns the percent of rows in the data that match the condition, as a decimal.                                                                                    | `share( [Source] = "Goolge" )`                                       |
| Starts with        | `startsWith(text, comparison)`                 | Returns true if the beginning of the text matches the comparison text.                                                                                             | `startsWith( [Course Name], "Computer Science" )`                    |
| Standard deviation | `StandardDeviation(column)`                    | Calculates the standard deviation of the column.                                                                                                                   | `StandardDeviation( [Population] )`                                  |
| Substring          | `substring(text, position, length)`            | Returns a portion of the supplied text.                                                                                                                            | `substring( [Title], 0, 10 )`                                        |
| Sum                | `sum(column)`                                  | Adds up all the values of the column.                                                                                                                              | `sum( [Subtotal]` )                                                  |
| Sum if             | `sumif(column, condition)`                     | Sums up the specified column only for rows where the condition is true.                                                                                            | `sumif( [Subtotal], [Order Status] = "Valid" )`                      |
| Square root        | `sqrt(number)`                                 | Returns the square root.                                                                                                                                           | `sqrt([Hypotenuse])`                                                 |
| Trim               | `trim(string)`                                 | Removes leading and trailing whitespace from a string of text.                                                                                                     | `trim( [Comment] )`                                                  |
| Upper              | `upper(text)`                                  | Returns the text in all upper case.                                                                                                                                | `upper( [Status] )`                                                  |
| Variance           | `variance(column)`                             | Returns the numeric variance for a given column.                                                                                                                   | `variance([Temperature])`                                            |

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
