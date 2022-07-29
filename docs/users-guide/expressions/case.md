---
title: Case
---

# Case

`case` checks if a value matches a list of conditions, and returns some output based on the first condition that's met. Basically, `case` works the same way as ["if... then" logic](#spreadsheets), but it's much nicer to write.

You can optionally tell `case` to return a default output if none of the conditions are met. If you don't set a default output, `case` will return `null` after checking all of your conditions (`null` values are displayed as blank values in Metabase).

Use the `case` expression whenever you need to bucket a range of values, label the rows in your dataset, or aggregate rows based on conditional logic.

| Syntax                                                                | Example                                         |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `case(condition1, output1, condition2, output2, ..., default_output)` | `case()` |
| Returns the output from the first condition that's met.               | "sample output"         |

<div class='doc-toc' markdown=1>
- [Bucketing data for frequency tables or histograms]().
- [Labeling a row based on conditions from multiple columns]().
- [Aggregating data based on conditions from multiple columns]().
- [Accepted data types](#accepted-data-types).
- [Limitations](#limitations).
- [Converting other functions to `case` expressions](#converting-other-functions-to-case-expressions).
- [Further reading](#further-reading).
</div> 

## Bucketing data for frequency tables or histograms

| Amount | <code>case(Amount >=0  AND Amount <= 9,   "0-9",<br>      Amount >=10 AND Amount <= 19,  "10-19",<br>      Amount >=20 AND Amount <= 29,  "20-29",<br>      Amount >=30 AND Amount <= 39,  "30-39",<br>      Amount >=40 AND Amount <= 49,  "40-49", "50+")</code> |
|--------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 6      | 0-9                                                                                                                                                                                                                                                          |
| 18     | 10-19                                                                                                                                                                                                                                                        |
| 31     | 30-39                                                                                                                                                                                                                                                        |
| 57     | 50+                                                                                                                                                                                                                                                          |

## Labeling a row based on conditions from multiple columns

| sighting_id | has_wings | has_face | <code>case([has_wings]=TRUE  AND [is_alive]=TRUE,  "Bird",<br>      [has_wings]=TRUE  AND [is_alive]=FALSE, "Plane",<br>      [has_wings]=FALSE AND [is_alive]=TRUE,  "Superman")</code> |
|-------------|-----------|----------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1           | True      | True     | Bird                                                                                                                                                                                 |
| 2           | True      | False    | Plane                                                                                                                                                                                |
| 3           | False     | False    | Superman                                                                                                                                                                             |
| 4           | False     | True     | null                                                                                                                                                                                 |

You can use the columns holding your "labels" to:

- Apply business definitions or business logic to your datasets.
- Power a filter.
- Segment data for data sandboxing.

## Aggregating data based on conditions from multiple columns

You can combine `case` with aggregate functions from **Summarize** > **Custom expression**.

For example, if we want to count the unique number of orders with a "shipped" status for each order date:

| Order ID | Order Date | Status    |
|----------|------------|-----------|
| 1        | 2022-04-01 | Paid      |
| 1        | 2022-04-03 | Shipped   |
| 2        | 2022-05-12 | Paid      |
| 2        | 2022-05-12 | Cancelled |

1. Create the custom expression `distinct(case([Status] = "Shipped", [Order ID]))` and name it "Total Orders Shipped".
2. Choose **Order Date** as the group by column.
3. Click **Visualize** to return the result:

| Order Date | Total Orders Shipped |
|------------|----------------------|
| 2022-04-01 | 1                    |
| 2022-05-01 | 0                    |

## Accepted data types

| [Data type][data-types] | Works with `case` |
| ----------------------- | ----------------- |
| String                  | ✅                |
| Number                  | ✅                |
| Timestamp               | ✅                |
| Boolean                 | ✅                |
| JSON                    | ❌                |

## Limitations

All of the outputs must have the same data type.

For example, **don't** do this:

```sql
case(condition1, "string", condition2, TRUE, condition3, 1)
```

Do this instead:

```sql
case(condition1, "string", condition2, "TRUE", condition3, "1")
```

## Converting other functions to `case` expressions

This section covers functions and formulas that can be used interchangeably with the Metabase `case` expression, with notes on how to choose the best option for your use case.

**Metabase expressions**

- [Coalesce](#coalesce)
- [Countif](#countif)
- [Sumif](#sumif)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### Coalesce

Using the table from the [Coalesce: Consolidating values](./coalesce#consolidating-values-from-different-columns) example:

| Notes          | Comments          | `coalesce([Notes], [Comments] "No notes or comments.")` |
| -------------- | ----------------- | ------------------------------------------------------- |
| I have a note. | I have a comment. | I have a note.                                          |
|                | I have a comment. | I have a comment.                                       |
| I have a note. |                   | I have a note.                                          |
|                |                   | No notes or comments.                                   |

The `coalesce` expression

```sql
coalesce([Notes], [Comments] "No notes or comments.")
```

is equivalent to the `case` expression

```sql
case(ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = FALSE, [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = False, [Comments],
     ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = TRUE,  [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = TRUE,  "No notes or comments")
```

`coalesce` is much nicer to write if you don't mind taking the first value when both of your columns are non-blank. Use `case` if you want to define a specific output (such as "I have a note _and_ a comment").

### Countif

Using the table from the [Aggregating data](#aggregating-data-based-on-conditions-from-multiple-columns) example:

| Order ID | Order Date | Status    |
|----------|------------|-----------|
| 1        | 2022-04-01 | Paid      |
| 1        | 2022-04-03 | Shipped   |
| 2        | 2022-05-12 | Paid      |
| 2        | 2022-05-12 | Cancelled |

The `countif` expression

```sql
countif(case([Status] = "Shipped"))
```

is equivalent to the `case` expression:

```sql
count(case([Status] = "Shipped"), [Row ID])
```

`countif` is equivalent to `case` when you are counting **all** rows in the table that meet your condition. It is **not** equivalent if you want to count **distinct** rows that meet your condition.

### Sumif

Using an expanded version of the table from the [Aggregating data](#aggregating-data-based-on-conditions-from-multiple-columns) example:

| Row ID | Order ID | Order Date | Status    | Amount |
|--------|----------|------------|-----------|--------|
| 1      | 1        | 2022-04-01 | Paid      | $20    |
| 2      | 1        | 2022-04-03 | Shipped   | $20    |
| 3      | 2        | 2022-05-12 | Paid      | $80    |
| 4      | 2        | 2022-05-12 | Cancelled | $80    |

The `sumif` expression

```sql
sumif([Amount],[Status] = "Shipped")
```

is equivalent to the `case` expression:

```sql
sum(case([Status] = "Shipped"), [Amount])
```

`sumif` is equivalent to `case` when you sum a single column for single condition (where conditions can include multiple columns). 

You should use `case` if you want to sum a different column under a different condition. For example, if you want to sum the **Amount** column when **Status** = "Shipped" and another (hypothetical) column like **Refunded Amount** when **Status** = "Refunded".

### SQL

In general, questions created from the notebook editor are converted into SQL queries that runs against your database or data warehouse. Metabase `case` expressions are converted into SQL `CASE WHEN` statements.

Using the table from the [Labeling rows](#labeling-a-row-based-on-conditions-from-multiple-columns) example:

| sighting_id | has_wings | has_face | <code>case([has_wings]=TRUE  AND [is_alive]=TRUE,  "Bird",<br>      [has_wings]=TRUE  AND [is_alive]=FALSE, "Plane",<br>      [has_wings]=FALSE AND [is_alive]=TRUE,  "Superman")</code> |
|-------------|-----------|----------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1           | True      | True     | Bird                                                                                                                                                                                 |
| 2           | True      | False    | Plane                                                                                                                                                                                |
| 3           | False     | False    | Superman                                                                                                                                                                             |
| 4           | False     | True     | null                                                                                                                                                                                 |

The SQL `CASE WHEN` statement:

```sql
SELECT 
CASE WHEN has_wings = TRUE  AND is_alive = TRUE  THEN "Bird"
     WHEN has_wings = TRUE  AND is_alive = FALSE THEN "Plane"
     WHEN has_wings = FALSE AND is_alive = TRUE  THEN "Superman" END
FROM mystery_sightings
```

is equivalent to the `case` expression:

```sql
case([has_wings]=TRUE  AND [is_alive]=TRUE,  "Bird",
     [has_wings]=TRUE  AND [is_alive]=FALSE, "Plane",
     [has_wings]=FALSE AND [is_alive]=TRUE,  "Superman")
```

For example, this [SQL trick to order bar charts](https://www.metabase.com/learn/sql-questions/sql-tricks-ordering-charts) could be written using a Metabase `case` expression instead.

### Spreadsheets

Using the table from the [Labeling rows](#labeling-a-row-based-on-conditions-from-multiple-columns) example:

| sighting_id | has_wings | has_face | <code>case([has_wings]=TRUE  AND [is_alive]=TRUE,  "Bird",<br>      [has_wings]=TRUE  AND [is_alive]=FALSE, "Plane",<br>      [has_wings]=FALSE AND [is_alive]=TRUE,  "Superman")</code> |
|-------------|-----------|----------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1           | True      | True     | Bird                                                                                                                                                                                 |
| 2           | True      | False    | Plane                                                                                                                                                                                |
| 3           | False     | False    | Superman                                                                                                                                                                             |
| 4           | False     | True     | null                                                                                                                                                                                 |

The spreadsheet formula

```
=IF(A:A = TRUE AND B:B = TRUE, "Bird", 
    IF(A:A = TRUE AND B:B = FALSE, "Plane",
       IF(A:A = FALSE AND B:B = TRUE, "Superman")
      )
    )
```

is equivalent to the Metabase `case` expression: 

```sql
case([has_wings]=TRUE  AND [is_alive]=TRUE,  "Bird",
     [has_wings]=TRUE  AND [is_alive]=FALSE, "Plane",
     [has_wings]=FALSE AND [is_alive]=TRUE,  "Superman")
```

### Python

Assuming the [mysterious sightings table](#converting-other-functions-to-coalesce-expressions) is in a dataframe called `df`, all of the following `pandas` functions

```
df['custom_column'] = ...
```

are equivalent to the Metabase `case` expression: 

```sql
case([has_wings]=TRUE  AND [is_alive]=TRUE,  "Bird",
     [has_wings]=TRUE  AND [is_alive]=FALSE, "Plane",
     [has_wings]=FALSE AND [is_alive]=TRUE,  "Superman")
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[custom-expressions-doc]: ./expressions
[custom-expressions-learn]: /learn/questions/custom-expressions
[data-types]: /learn/databases/data-types-overview#examples-of-data-types
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
[spreadsheets-to-bi]: /blog/spreadsheets-to-bi
[sql-reference-guide]: /learn/debugging-sql/sql-syntax.html#common-sql-reference-guides