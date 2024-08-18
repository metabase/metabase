---
title: Coalesce
---

# Coalesce

`coalesce` looks at the values in a list (in order), and returns the first non-null value.

This function is useful when you want to:

- [fill in missing data](#filling-in-empty-or-null-values),
- [consolidate data from multiple columns](#consolidating-values-from-different-columns), or
- [create calculations across multiple columns](#creating-calculations-across-different-columns).

| Syntax                                                  | Example                                         |
| ------------------------------------------------------- | ----------------------------------------------- |
| `coalesce(value1, value2, …)`                           | `coalesce("null", "null", "bananas", "null" …)` |
| Returns the first non-null value from a list of values. | “bananas”                                       |

## Filling in empty or null values

| left_table_col | right_table_col | `coalesce([right_table_col], 0)` |
| -------------- | --------------- | -------------------------------- |
| 1              | 1               | 1                                |
| 2              | `null`          | 0                                |
| 3              | `null`          | 0                                |
| 4              | 4               | 4                                |

You may want to fill in empty or null values if you have:

- Sparse data.
- `null` values created by a left join (the example shown above).

For a more detailed example, see [Filling in data for missing report dates][missing-dates].

## Consolidating values from different columns

| Notes          | Comments          | `coalesce([Notes], [Comments] "No notes or comments.")` |
| -------------- | ----------------- | ------------------------------------------------------- |
| I have a note. | I have a comment. | I have a note.                                          |
|                | I have a comment. | I have a comment.                                       |
| I have a note. |                   | I have a note.                                          |
|                |                   | No notes or comments.                                   |

## Creating calculations across different columns

| Subtotal | Discount | `coalesce([Subtotal], 0) - coalesce([Discount], 0)` |
| -------- | -------- | --------------------------------------------------- |
| 10.00    | 0.15     | 9.85                                                |
| 21.00    |          | 21.00                                               |
| 16.00    | 1.60     | 14.40                                               |
| 4.00     |          | 4.00                                                |

Calculations in Metabase will return `null` if any of the input columns are `null`. This is because `null` values in your data represent "missing" or "unknown" information, which isn't necessarily the same as an amount of "0". That is, adding 1 + "unknown" = "unknown".

If you want to treat "unknown" values as zeroes (or some other value that means "nothing" in your data), we recommend using `coalesce` to wrap the columns used in your calculations.

## Accepted data types

| [Data type][data-types] | Works with `coalesce` |
| ----------------------- | --------------------- |
| String                  | ✅                    |
| Number                  | ✅                    |
| Timestamp               | ✅                    |
| Boolean                 | ✅                    |
| JSON                    | ❌                    |

## Limitations

Use the same data types within a single `coalesce` function. If you want to coalesce values that have different data types:

- Use the SQL `CAST` operator.
- [Change the data type from the Table Metadata page][cast-data-type].

If you want to use `coalesce` with JSON or JSONB data types, you'll need to flatten the JSON objects first. For more information, look up the JSON functions that are available in your SQL dialect. You can find some [common SQL reference guides here][sql-reference-guide].

## Related functions

This section covers functions and formulas that can be used interchangeably with the Metabase `coalesce` expression, with notes on how to choose the best option for your use case.

**Metabase expressions**

- [case](#case)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

All examples use the custom expression and sample data from the [Consolidating values](#consolidating-values-from-different-columns) example:

| Notes          | Comments          | `coalesce([Notes], [Comments] "No notes or comments.")` |
| -------------- | ----------------- | ------------------------------------------------------- |
| I have a note. | I have a comment. | I have a note.                                          |
|                | I have a comment. | I have a comment.                                       |
| I have a note. |                   | I have a note.                                          |
|                |                   | No notes or comments.                                   |

### Case

The [Metabase `case` expression](./case.md)

```
case(ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = FALSE, [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = False, [Comments],
     ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = TRUE,  [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = TRUE,  "No notes or comments")
```

is equivalent to the Metabase `coalesce` expression:

```
coalesce([Notes], [Comments] "No notes or comments.")
```

`coalesce` is much nicer to write if you don't mind taking the first value when both of your columns are non-blank. [Use `case` if you want to define a specific output][case-to-coalesce] (e.g., if you want to return "I have a note _and_ a comment" instead of "I have a note".).

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse.

The SQL `coalesce` function

```sql
SELECT
    COALESCE(notes, comments, "no notes or comments")
FROM
    sample_table;
```

is equivalent to the Metabase `coalesce` expression:

```
coalesce([Notes], [Comments] "No notes or comments.")
```

### Spreadsheets

If your [notes and comments table](#consolidating-values-from-different-columns) is in a spreadsheet where "Notes" is in column A, and "Comments" is in column B, then the formula

```
=IF(ISBLANK($A2),$B2,IF(ISBLANK($B2),$A2,"No notes or comments."))
```

is equivalent to the Metabase `coalesce` expression:

```
coalesce([Notes], [Comments] "No notes or comments.")
```

Alternatively, you may be used to working with a INDEX and MATCH in an array formula if you’re “coalescing” data across three or more columns in a spreadsheet.

### Python

Assuming the [notes and comments table](#consolidating-values-from-different-columns) is in a dataframe called `df`, the combination of `pandas` functions `combine_first()` and `fillna()`

```
df['custom_column'] = df['notes'].combine_first(df['comments'])\
                                 .fillna('No notes or comments.')
```

are equivalent to the Metabase `coalesce` expression:

```
coalesce([Notes], [Comments] "No notes or comments.")
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[case-to-coalesce]: ./case.md#coalesce
[cast-data-type]: ../../../data-modeling/metadata-editing.md#casting-to-a-specific-data-type
[custom-expressions-doc]: ../expressions.md
[custom-expressions-learn]: https://www.metabase.com/learn/questions/custom-expressions
[data-types]: https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types
[missing-dates]: https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-logic-missing-data#how-to-fill-in-data-for-missing-report-dates
[notebook-editor-def]: https://www.metabase.com/glossary/notebook_editor
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
[spreadsheets-to-bi]: /blog/spreadsheets-to-bi
[sql-reference-guide]: https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-syntax#common-sql-reference-guides
