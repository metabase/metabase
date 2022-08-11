---
title: Isempty
---

# Isempty

`isempty` checks if a value is an empty string (`""`).

**In Metabase, you must combine `isempty` with another expression that accepts boolean arguments (i.e., true or false).** The table below shows you examples of the boolean output that will be passed to your other expression(s).

| Syntax                                                             | Example with an empty string | Example with a true `null`   |
| ------------------------------------------------------------------ | ---------------------------- | ---------------------------- |
| `isempty(value)`                                                   | `isempty("")`                | `isempty(null)`              |
| Returns `true` if the value is an empty string, `false` otherwise. | `true`                       | `false`                      |

## How Metabase handles nulls

In Metabase, columns with string data types can display empty or blank cells for empty strings or `null` values. For example, in the column below, the empty cells could contain either:

- `""`: feedback was submitted and left intentionally blank, so the customer had "no feedback to give".
- `null`: no feedback was submitted, so the customer's thoughts are "unknown".

| Customer Feedback  | 
| ------------------ | 
|                    | 
| I like your style. | 
|                    |

## Replacing empty strings with another value

| Feedback           | `case(isempty([Feedback]), "No feedback.", "Unknown feedback.")`| 
| ------------------ | --------------------------------------------------------------- | 
|                    | Unknown feedback.                                               | 
| I like your style. | I like your style.                                              | 
|                    | No feedback.                                                    |

Combine `isempty` with the [`case` expression](./case) to replace empty strings with something more descriptive.

If the first row's blank cell is actually an empty string (or even an emoji that blends into your table background), then `isnull` will return `false`, and `case` will return the default output "No feedback".

If the third row's blank cell is actually a `null`, then `isnull` will return `true`. The `case` statement evaluates `true` to return the first output "Unknown feedback".

## Accepted data types

| [Data type][data-types] | Works with `isempty`  |
| ----------------------- | --------------------- |
| String                  | ✅                    |
| Number                  | ❌                    |
| Timestamp               | ❌                    |
| Boolean                 | ❌                    |
| JSON                    | ❌                    |

## Limitations

- `isempty` only accepts values with a string data type. If you need to deal with columns that have contain other data type, use `isnull`.
- In Metabase, you must combine `isempty` with another expression that accepts boolean arguments (i.e., `true` or `false`).

## Converting a function into an `isempty` expression

This section covers functions and formulas that can be used interchangeably with the Metabase `isempty` expression, with notes on how to choose the best option for your use case.

**Metabase expressions**

- [isempty](#isnull)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

## isnull

When combined with `case`, the Metabase `isnull` expression can be used to figure out if a blank cell contains a `null` value instead of an empty string.

```
`case(isnull([Feedback]), "Unknown feedback.", [Feedback]="", "No feedback.")`
```

is equivalent to the Metabase `isempty` expression:

```
`case(isempty([Feedback]), "No feedback.", "Unknown feedback.")`
```

`isempty` cannot be used to check for `null` values.

- Use `isempty` if you're working with columns that have a string data type _and_ your column are non-nullable.
- Use `isnull` if your columns are nullable (or if you're not sure what type of blank values you're dealing with).

### SQL

### Spreadsheets

### Python
