# Writing expressions in the notebook editor

[Custom expressions][custom-expressions] are like formulas in spreadsheet software like Excel, Google Sheets, and LibreOffice Calc.
When using the query builder, you can use expressions to create a new:

- **Filter**. The expression `= contains([comment], "Metabase")` would filter for rows where the `comment` field contained the word "Metabase".
- **Metric**. `= share([Total] > 50)` would return the percentage of orders with totals greater than 50 dollars.
- **Custom column** You could use `= [Subtotal] / [Quantity]` to create a new column, which you could name "Item price".

See a full list of [expressions][expression-list].

## How to write expressions

In each of these three places, you can:

- Use parentheses to group parts of your expression.
- Use basic mathematical operators: `+`, `-`, `*` (multiply), `/` (divide) on numeric column with numeric values, like integers, floats, and doubles. You can't currently do math on timestamp columns. - Use conditional operators: `AND`, `OR`, `NOT`, `>`, `>=` (greater than or equal to), `<`, `<=` (less than or equal to), `=`, `!=` (not equal to).
- Refer to columns in the current table, or columns that are linked via a foreign key relationship. Column names should be included inside of square brackets, like this: `[Name of Column]`. Columns in connected tables can be referred to like this: `[ConnectedTableName.Column]`.
- Refer to saved [Segments or Metrics](../administration-guide/07-segments-and-metrics.md) that are present in the currently selected table. You write these out the same as with columns, like this: `[Valid User Sessions]`.
- Use most of the different functions listed below.

For a tutorial on working with custom expressions, check out [Custom expressions in the notebook editor][custom-expressions].

## Aggregation functions

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

## Filter expressions and conditionals

Some other things to keep in mind about filter expressions and conditionals:

- Filter expressions are different in that they must return something that's true or false. E.g., you could write `[Subtotal] + [Tax] < 100`, but not just `[Subtotal] + [Tax]`.
- You can use functions inside of the conditional portion of the `countif` and `sumif` aggregations, like so: `countif( round([Subtotal]) > 100 OR floor([Tax]) < 10 )`

## Working with dates in filter expressions

If you want to work with dates in your filter expressions, they'll need to follow the format, `"YYYY-MM-DD"` — i.e., four characters for the year, two for the month, and two for the day, enclosed in quotes and separated by dashes.

Example:

`between([Created At], "2020-01-01", "2020-03-31") OR [Received At] > "2019-12-25"`

This would return rows where `Created At` is between January 1, 2020 and March 31, 2020, or where `Received At` is after December 25, 2019.

## All expressions

See a full list of [expressions][expression-list].

For a tutorial on expressions, see [Custom expressions in the notebook editor][custom-expressions].


[custom-expressions]: https://www.metabase.com/learn/questions/custom-expressions.html
[expression-list]: expression-list.html
