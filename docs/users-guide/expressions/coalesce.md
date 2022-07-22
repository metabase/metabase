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
- [Filling in empty or null rows](#filling-in-empty-or-null-rows).
- [Consolidating values from different columns](#consolidating-values-from-different-columns).
- [Creating calculations across different columns](#creating-calculations-across-different-columns).
- [Accepted data types](#accepted-data-types).
- [Limitations](#limitations).
- [Related functions](#related-functions).
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

## Related functions

This section covers common functions and formulas from other tools that are equivalent to the Metabase `coalesce` expression:

- [SQL](#sql)
- [Spreadsheets](#spreadsheet)
- [Python](#python)

All examples use the custom expression and sample data from the [Consolidating values](#consolidating-values-from-different-columns) example:

| Notes          | Comments          | `coalesce([Notes], [Comments] "No notes or comments.")` |
| -------------- | ----------------- | ------------------------------------------------------- |
| I have a note. | I have a comment. | I have a note.                                          |
|                | I have a comment. | I have a comment.                                       |
| I have a note. |                   | I have a note.                                          |
|                |                   | No notes or comments.                                   |

### SQL

```
SELECT
    COALESCE(notes, comments, "no notes or comments")
FROM
    sample_table;
```

When you ask Metabase a question from the notebook editor or SQL editor, the question is converted into a SQL query that runs against your database or data warehouse.

The Metabase `coalesce` expression is equivalent to a SQL `coalesce` function.

### Spreadsheet

Assuming that "Notes" is in column A, and "Comments" is in column B:

```
=IF(ISBLANK($A2),$B2,IF(ISBLANK($B2),$A2,"No notes or comments."))
```

If you're used to consolidating values from three or more columns (e.g., "Notes", "Comments", "Ratings"), you may be familiar with an array formula like this instead:

```
{=INDEX(A2:B4,MATCH(FALSE,ISBLANK(A2:B4),FALSE))}
```

### Python

Using [pandas][pandas] and [numpy][numpy], and assuming our sample data is in a dataframe object called `df`:

```
df['custom_column'] = df['notes].combine_first(df['comments'])\
                                .combine_first("No notes or comments.")
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[cast-data-type]: /docs/latest/administration-guide/03-metadata-editing#casting-to-a-specific-data-type
[custom-expressions-doc]: /docs/latest/users-guide/expressions
[custom-expressions-learn]: /learn/questions/custom-expressions
[data-types]: /learn/databases/data-types-overview#examples-of-data-types
[missing-dates]: /learn/debugging-sql/sql-logic-missing-data#how-to-fill-in-data-for-missing-report-dates
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/