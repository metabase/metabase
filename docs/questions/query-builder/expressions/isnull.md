---
title: Isnull
---

# Isnull

`isNull` checks if a value is a `null`, a special kind of placeholder that's used by a database when something is missing or unknown.

## Syntax

```
isNull(text column)
```

You can use `isNull` in [custom filters](../expressions.md#filter-expressions-and-conditionals), or as the condition for conditional aggregations [`CountIf`](../expressions/countif.md) and [`SumIf`](../expressions/sumif.md). To create a custom column using `isNull`, you must combine `isNull` with another function that accepts boolean values, like [`case`](./case.md).

## How Metabase handles nulls

In Metabase tables, `null`s are displayed as blank cells. Additionally, for string columns, empty strings and strings containing only whitespace characters will be displayed as blank as well.

The table below shows you examples of the output of `isNull`.

| Metabase shows | Database value      | `isNull(value)` |
| -------------- | ------------------- | --------------- |
|                | `null`              | `true`          |
|                | `""` (empty string) | `false`\*       |
|                | `" "` (whitespace)  | `false`         |
| kitten         | `"kitten"`          | `false`         |

\*In Oracle and Vertica databases, empty strings are treated as nulls instead.

## Creating a boolean custom column

To create a custom column using `isNull`, you must combine `isNull` with another function.
For example, if you want to create a custom column that contains `true` when the `Discount` column is null, and `false` otherwise, you can use the [`case expression`](./case.md) :

```
case(isNull([Discount]), true, false)
```

## Replacing null values with another value

Combine `isNull` with the [`case` expression](./case.md) to replace missing information with something more descriptive:

For example, you can create a new custom column that will contain `"Unknown feedback"` when the original `[Feedback]` column is null, and the actual feedback value when `[Feedback]` is has a value. The custom expression to do it is:

```
case(isNull([Feedback]), "Unknown feedback.", [Feedback])
```

| Feedback               | `case(isNull([Feedback]), "Unknown feedback.", [Feedback])` |
| ---------------------- | ----------------------------------------------------------- |
| `null`                 | `"Unknown feedback."`                                       |
| `""`                   | `""`                                                        |
| `"I like your style."` | `"I like your style."`                                      |

## Accepted data types

| [Data type][data-types] | Works with `isNull` |
| ----------------------- | ------------------- |
| String                  | ✅                  |
| Number                  | ✅                  |
| Timestamp               | ✅                  |
| Boolean                 | ✅                  |
| JSON                    | ✅                  |

## Limitations

- In Metabase, you must combine `isNull` with another expression that accepts boolean arguments (i.e., `true` or `false`).
- `isNull` only accepts one value at a time. If you need to deal with blank cells across multiple columns, see the [coalesce expression](./coalesce.md).
- If `isNull` doesn't seem to do anything to your blank cells, you might have empty strings. Try the [`isEmpty` expression](./isempty.md) instead.

## Related functions

This section covers functions and formulas that can be used interchangeably with the Metabase `isNull` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

All examples below use the table from the [Replacing null values](#replacing-null-values-with-another-value) example:

| Feedback               | `case(isNull([Feedback]), "Unknown feedback.", [Feedback])` |
| ---------------------- | ----------------------------------------------------------- |
| `null`                 | `"Unknown feedback."`                                       |
| `""`                   | `""`                                                        |
| `"I like your style."` | `"I like your style."`                                      |

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [query builder][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse.

```sql
CASE WHEN Feedback IS NULL THEN "Unknown feedback",
     ELSE Feedback END
```

is equivalent to the Metabase `isNull` expression:

```
case(isNull([Feedback]), "Unknown feedback.", [Feedback])
```

### Spreadsheets

Spreadsheet `#N/A`s are the equivalent of database `null`s (placeholders for "unknown" or "missing" information).

Assuming our sample [feedback column](#replacing-null-values-with-another-value) is in a spreadsheet where "Feedback" is in column A, then the formula

```
=IF(ISNA(A2), "Unknown feedback.", A2)
```

is equivalent to the Metabase `isNull` expression:

```
case(isNull([Feedback]), "Unknown feedback.", [Feedback])
```

### Python

[Numpy][numpy] and [pandas][pandas] use `NaN`s or `NA`s instead of `null`s.

Assuming our sample [feedback column](#replacing-null-values-with-another-value) is in a dataframe column called `df["Feedback"]`:

```
df["Custom Column"] = np.where(df["Feedback"].isnull(), "Unknown feedback.", df["Feedback"])
```

is equivalent to the Metabase `isNull` expression:

```
case(isNull([Feedback]), "Unknown feedback.", [Feedback])
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
