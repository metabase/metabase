---
title: Coalesce
---

# Coalesce

`coalesce` looks at the values in a list (in order), and returns the first non-null value.

This function is useful if you want to fill in missing data or consolidate data from multiple columns.

| Syntax                                                  | Example                                         |
| ------------------------------------------------------- | ----------------------------------------------- |
| `coalesce(value1, value2, …)`                           | `coalesce("null", "null", "bananas", "null" …)` |
| Returns the first non-null value from a list of values. | “bananas”                                       |

<div class='doc-toc' markdown=1>
- [Filling in empty or null values](#filling-in-empty-or-null-values).
- [Consolidating values from different columns](#consolidating-values-from-different-columns).
- [Creating calculations across different columns](#creating-calculations-across-different-columns).
- [Accepted data types](#accepted-data-types).
- [Limitations](#limitations).
- [Converting other functions to `coalesce` expressions](#converting-other-functions-to-coalesce-expressions).
- [Further reading](#further-reading).
</div>

## Filling in empty or null values

| left_table_col | right_table_col   | `coalesce([right_table_col], 0)` |
| -------------- | ----------------- | -------------------------------------------------- |
| 1              | 1                 | 1                                                  |
| 2              | `null`            | 0                                                  |
| 3              | `null`            | 0                                                  |
| 4              | 4                 | 4                                                  |

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
- [Change the data type from the Data Model page][cast-data-type].

If you want to use `coalesce` with JSON or JSONB data types, you'll need to flatten the JSON objects first. For more information, look up the JSON functions that are available in your SQL dialect. You can find some [common SQL reference guides here][sql-reference-guide].

## Converting other functions to `coalesce` expressions

This section covers functions and formulas that can be used interchangeably with the Metabase `coalesce` expression, with notes on how to choose the best option for your use case.

**Metabase expressions**

- [coalesce](#coalesce)

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

### Coalesce

The Metabase `case` expression

```sql
case(ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = FALSE, [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = False, [Comments],
     ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = TRUE,  [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = TRUE,  "No notes or comments")
```

is equivalent to the Metabase `coalesce` expression:

```sql
coalesce([Notes], [Comments] "No notes or comments.")
```

`coalesce` is much nicer to write if you don't mind taking the first value when both of your columns are non-blank. [Use `case`][case-to-coalesce] if you want to define a specific output (e.g., if you want to return "I have a note _and_ a comment" instead of "I have a note".).

### SQL

When you ask Metabase a question from the notebook editor or SQL editor, the question is converted into a SQL query that runs against your database or data warehouse.

The SQL `coalesce` function

```sql
SELECT
    COALESCE(notes, comments, "no notes or comments")
FROM
    sample_table;
```

is equivalent to the Metabase `coalesce` expression: 

```sql
coalesce([Notes], [Comments] "No notes or comments.")
```

### Spreadsheets

If your [notes and comments table](#converting-other-functions-to-coalesce-expressions) is in a spreadsheet where "Notes" is in column A, and "Comments" is in column B, then the formula

```
=IF(ISBLANK($A2),$B2,IF(ISBLANK($B2),$A2,"No notes or comments."))
```

is equivalent to the Metabase `coalesce` expression: 

```sql
coalesce([Notes], [Comments] "No notes or comments.")
```

Alternatively, you may be used to working with a INDEX and MATCH in an array formula if you’re “coalescing” data across three or more columns in a spreadsheet.

### Python

Assuming the [notes and comments table](#converting-other-functions-to-coalesce-expressions) is in a dataframe called `df`, the combination of `pandas` functions `combine_first()` and `fillna()`

```
df['custom_column'] = df['notes'].combine_first(df['comments'])\
                                 .fillna('No notes or comments.')
```

are equivalent to the Metabase `coalesce` expression: 

```sql
coalesce([Notes], [Comments] "No notes or comments.")
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[case-to-coalesce]: ./case#coalesce
[cast-data-type]: ../../administration-guide/03-metadata-editing#casting-to-a-specific-data-type
[custom-expressions-doc]: ./expressions
[custom-expressions-learn]: /learn/questions/custom-expressions
[data-types]: /learn/databases/data-types-overview#examples-of-data-types
[missing-dates]: /learn/debugging-sql/sql-logic-missing-data#how-to-fill-in-data-for-missing-report-dates
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
[spreadsheets-to-bi]: /blog/spreadsheets-to-bi
[sql-reference-guide]: /learn/debugging-sql/sql-syntax.html#common-sql-reference-guides