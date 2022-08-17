---
title: Isnull
---

# Isnull

`isnull` checks if a value is a `null`, a special kind of placeholder that's used by a database when something is missing or unknown.

**In Metabase, you must combine `isnull` with another expression that accepts boolean values.** The table below shows you examples of the boolean value that will be passed to your other expression(s).

| Syntax                                                | Example with a true `null` | Example with an empty string |
| ----------------------------------------------------- | -------------------------- | ---------------------------- |
| `isnull(value)`                                       | `isnull(null)`             | `isnull("")`                 |
| Returns `true` if a value is `null`, false otherwise. | `true`                     | `false`                      |

## How Metabase handles nulls

In Metabase tables, `null`s are displayed as blank cells. For example, in the Feedback column below, the blank cells could contain either:

- `null`: no feedback was submitted, so the customer's thoughts are "unknown".
- `""`: feedback was submitted and left intentionally blank, so the customer had "no feedback to give".

| Customer Feedback  |
| ------------------ |
|                    |
|                    |
| I like your style. |

## Replacing null values with another value

| Feedback           | `case(isnull([Feedback]), "Unknown feedback.", [Feedback])` |
| ------------------ | ----------------------------------------------------------- |
|                    | Unknown feedback.                                           |
|                    |                                                             |
| I like your style. | I like your style.                                          |

Combine `isnull` with the [`case` expression](./case) to replace "unknown" information with something more descriptive.

Let's say that the first row's blank cell is actually a `null`, so `isnull` will return `true`. The `case` statement evaluates `true` to return the first output "Unknown feedback".

The second row's blank cell doesn't have a `null`, but we're not sure what's in it either---it could be an empty string, or even an emoji that blends into your table's background. No matter what the edge case is, `isnull` will return `false`, and `case` will return whatever's in the Feedback column as the default output.

## Accepted data types

| [Data type][data-types] | Works with `isnull` |
| ----------------------- | ------------------- |
| String                  | ✅                  |
| Number                  | ✅                  |
| Timestamp               | ✅                  |
| Boolean                 | ✅                  |
| JSON                    | ✅                  |

## Limitations

- In Metabase, you must combine `isnull` with another expression that accepts boolean arguments (i.e., `true` or `false`).
- `isnull` only accepts one value at a time. If you need to deal with blank cells across multiple columns, see the [coalesce expression](./coalesce).
- If `isnull` doesn't seem to do anything to your blank cells, you might have empty strings. Try the [`isempty` expression](./isempty) instead.

## Converting a function into an `isnull` expression

This section covers functions and formulas that can be used interchangeably with the Metabase `isnull` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

All examples below use the table from the [Replacing null values](#replacing-null-values-with-another-value) example:

| Feedback           | `case(isnull([Feedback]), "Unknown feedback.", [Feedback])` |
| ------------------ | ----------------------------------------------------------- |
|                    | Unknown feedback.                                           |
|                    |                                                             |
| I like your style. | I like your style.                                          |

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse.

```sql
CASE WHEN Feedback IS NULL THEN "Unknown feedback",
     ELSE Feedback END
```

is equivalent to the Metabase `isnull` expression:

```
case(isnull([Feedback]), "Unknown feedback.", [Feedback])
```

### Spreadsheets

Spreadsheet `#N/A`s are the equivalent of database `null`s (placeholders for "unknown" or "missing" information).

Assuming our sample [feedback column](#replacing-null-values-with-another-value) is in a spreadsheet where "Feedback" is in column A, then the formula

```
=IF(ISNA(A2), "Unknown feedback.", A2)
```

is equivalent to the Metabase `isnull` expression:

```
case(isnull([Feedback]), "Unknown feedback.", [Feedback])
```

### Python

[Numpy][numpy] and [pandas][pandas] use `NaN`s or `NA`s instead of `null`s.

Assuming our sample [feedback column](#replacing-null-values-with-another-value) is in a dataframe column called `df["Feedback"]`:

```
df["Custom Column"] = np.where(df["Feedback"].isnull(), "Unknown feedback.", df["Feedback"])
```

is equivalent to the Metabase `isnull` expression:

```
case(isnull([Feedback]), "Unknown feedback.", [Feedback])
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[custom-expressions-doc]: ../expressions.md
[custom-expressions-learn]: /learn/questions/custom-expressions
[data-types]: /learn/databases/data-types-overview#examples-of-data-types
[notebook-editor-def]: /glossary/notebook_editor
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
