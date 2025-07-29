---
title: Isempty
---

# Isempty

`isEmpty` checks whether a value in a **string column** is an empty string (`""`) or null. Calling `isEmpty` on a non-string column would cause an error.

## Syntax

```
isEmpty(text column)
```

You can use `isEmpty` in [custom filters](../expressions.md#filter-expressions-and-conditionals), or as the condition for conditional aggregations [`CountIf`](../expressions/countif.md) and [`SumIf`](../expressions/sumif.md). To create a custom column using `isEmpty`, you must combine `isEmpty` with another function that accepts boolean values, like [`case`](./case.md).

## How Metabase handles empty strings and null values

In Metabase, columns with string [data types][data-types] will display blank cells for empty strings, strings of whitespace characters, _or_ `null` values (if the column is nullable in your database).
The table below shows you examples of the output of `isEmpty`.

| Metabase shows | Database value      | `isEmpty(value)` |
| -------------- | ------------------- | ---------------- |
|                | `null`              | `true`           |
|                | `""` (empty string) | `true`           |
|                | `" "` (whitespace)  | `false`          |
| kitten         | `"kitten"`          | `false`          |

## Creating a boolean custom column

To create a custom column using `isEmpty`, you must combine `isEmpty` with another function.
For example, if you want to create a custom column that contains `true` when the `Feedback` column is empty or null, and `false` otherwise, you can use the [`case expression`](./case.md) :

```
case(isEmpty([Feedback]), true, false)
```

## Replacing empty strings with another value

You can combine `isEmpty` with the [`case` expression](./case.md) to replace empty strings with something more descriptive.

For example, you can create a new custom column that will contain `"No feedback"` when the original `[Feedback]` column is empty or null, and the feedback value when `[Feedback]` is has a non-empty value. The custom expression to do it is:

```
case(isEmpty([Feedback]), "No feedback.", [Feedback])
```

| Feedback               | `case(isEmpty([Feedback]), "No feedback.", [Feedback])` |
| ---------------------- | ------------------------------------------------------- |
| `""`                   | `"No feedback."`                                        |
| `null`                 | `"No feedback."`                                        |
| `"I like your style."` | `"I like your style."`                                  |

## Accepted data types

| [Data type][data-types] | Works with `isEmpty` |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Limitations

- To create a custom column you must combine `isEmpty` with another expression that accepts boolean arguments (i.e., `true` or `false`).
- `isEmpty` only accepts one value at a time. If you need to deal with empty strings from multiple columns, you'll need to use multiple `isEmpty` expressions with the [case expression](./case.md).

## Related functions

This section covers functions and formulas that can be used interchangeably with the Metabase `isEmpty` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

All examples below use the table from the [Replacing empty strings](#replacing-empty-strings-with-another-value) example:

| Feedback               | `case(isEmpty([Feedback]), "No feedback.", [Feedback])` |
| ---------------------- | ------------------------------------------------------- |
| `""`                   | `"No feedback."`                                        |
| `null`                 | `"No feedback."`                                        |
| `"I like your style."` | `"I like your style."`                                  |

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [query builder][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse.

```sql
CASE WHEN (Feedback = "" OR Feedback IS NULL) THEN "No feedback"
     ELSE Feedback END
```

is equivalent to the Metabase `isEmpty` expression:

```
case(isEmpty([Feedback]), "No feedback.", [Feedback])
```

### Spreadsheets

If our sample [feedback column](#replacing-empty-strings-with-another-value) is in a spreadsheet where "Feedback" is in column A, then the formula

```
=IF(A2 = "", "Unknown feedback.", A2)
```

is equivalent to the Metabase `isEmpty` expression:

```
case(isEmpty([Feedback]), "No feedback.", [Feedback])
```

### Python

Assuming the sample [feedback column](#replacing-empty-strings-with-another-value) is in a dataframe column called `df["Feedback"]`:

```python
df["Custom Column"] = np.where((df["Feedback"] == "") | (df["Feedback"].isnull()), "No feedback.", df["Feedback"])
```

is equivalent to the Metabase `isEmpty` expression:

```
case(isEmpty([Feedback]), "No feedback.", [Feedback])
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[custom-expressions-doc]: ../expressions.md
[custom-expressions-learn]: https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/custom-expressions
[data-types]: https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types
[notebook-editor-def]: https://www.metabase.com/glossary/query-builder
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
