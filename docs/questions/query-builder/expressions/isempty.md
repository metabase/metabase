---
title: Isempty
---

# Isempty

`isempty` checks if a value in a **string column** is an empty string (`""`).

**In Metabase, you must combine `isempty` with another expression that accepts boolean values.** The table below shows you examples of the boolean output that will be passed to your other expression(s).

| Syntax                                                             | Example with an empty string | Example with a true `null` |
| ------------------------------------------------------------------ | ---------------------------- | -------------------------- |
| `isempty(value)`                                                   | `isempty("")`                | `isempty(null)`            |
| Returns `true` if the value is an empty string, `false` otherwise. | `true`                       | `false`                    |

## How Metabase handles empty strings

In Metabase, columns with string [data types][data-types] will display blank cells for empty strings _or_ `null` values (if the column is nullable in your database).

For example, in the column below, the empty cells could contain either:

- `""`: feedback was submitted and left intentionally blank, so the person had "no feedback to give".
- `null`: no feedback was submitted, so the person's thoughts are "unknown".

| Feedback           |
| ------------------ |
|                    |
|                    |
| I like your style. |

## Replacing empty strings with another value

| Feedback           | `case(isempty([Feedback]), "No feedback.", [Feedback])` |
| ------------------ | ------------------------------------------------------- |
|                    |                                                         |
|                    | No feedback.                                            |
| I like your style. | I like your style.                                      |

Combine `isempty` with the [`case` expression](./case) to replace empty strings with something more descriptive.

Let's say that the second row's blank cell is actually an empty string, so `isempty` will return `true`. The `case` statement evaluates `true` to return the first output "No feedback".

The first row's blank cell doesn't have an empty string, but because it's blank, we're not sure what's in it either---it could be a `null`, or even an emoji that blends into your table background. No matter what the edge case is, `isempty` will return `false`, and `case` will return whatever's in the Feedback column as the default output.

## Accepted data types

| [Data type][data-types] | Works with `isempty` |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Limitations

- In Metabase, you must combine `isempty` with another expression that accepts boolean arguments (i.e., `true` or `false`).
- `isempty` only accepts one value at a time. If you need to deal with empty strings from multiple columns, you'll need to use multiple `isempty` expressions with the [case expression](./case).
- If `isempty` doesn't seem to do anything to your blank cells, you might have `null` values. Try the [`isnull` expression](./isnull) instead.

## Converting a function into an `isempty` expression

This section covers functions and formulas that can be used interchangeably with the Metabase `isempty` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

All examples below use the table from the [Replacing empty strings](#replacing-empty-strings-with-another-value) example:

| Feedback           | `case(isempty([Feedback]), "No feedback.", [Feedback])` |
| ------------------ | ------------------------------------------------------- |
|                    |                                                         |
|                    | No feedback.                                            |
| I like your style. | I like your style.                                      |

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse.

```sql
CASE WHEN Feedback = "" THEN "No feedback"
     ELSE Feedback END
```

is equivalent to the Metabase `isempty` expression:

```
case(isempty([Feedback]), "No feedback.", [Feedback])
```

### Spreadsheets

If our sample [feedback column](#replacing-empty-strings-with-another-value) is in a spreadsheet where "Feedback" is in column A, then the formula

```
=IF(A2 = "", "Unknown feedback.", A2)
```

is equivalent to the Metabase `isempty` expression:

```
case(isempty([Feedback]), "No feedback.", [Feedback])
```

### Python

Assuming the sample [feedback column](#replacing-empty-strings-with-another-value) is in a dataframe column called `df["Feedback"]`:

```
df["Custom Column"] = np.where(df["Feedback"] == "", "No feedback.", df["Feedback"])
```

is equivalent to the Metabase `isempty` expression:

```
case(isempty([Feedback]), "No feedback.", [Feedback])
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[custom-expressions-doc]: ../expressions
[custom-expressions-learn]: /learn/questions/custom-expressions
[data-types]: /learn/databases/data-types-overview#examples-of-data-types
[notebook-editor-def]: /glossary/notebook_editor
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
