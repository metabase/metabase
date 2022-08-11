---
title: Isnull
---

# Isnull

`isnull` checks if a value is a `null`, a special kind of placeholder that's used by a database when something is missing or unknown.

**In Metabase, you must combine `isnull` with another expression that accepts boolean arguments (i.e., true or false).** The table below shows you examples of the boolean value that will be passed to your other expression(s).

| Syntax                                                | Example with a true `null` | Example with an empty string |
| ---------------------------------------------------   | -------------------------- | ---------------------------- |
| `isnull(value)`                                       | `isnull(null)`             | `isnull("")`                 |
| Returns `true` if a value is `null`, false otherwise. | `true`                     | `false`                      |

## How Metabase handles nulls

In Metabase tables, `null`s are displayed as empty or blank cells. For example, in the column below, the empty cells could contain either:

- `null`: no feedback was submitted, so the customer's thoughts are "unknown".
- `""`: feedback was submitted and left intentionally blank, so the customer had "no feedback to give".

| Customer Feedback  | 
| ------------------ | 
|                    | 
| I like your style. | 
|                    |

## Replacing null values with another value

| Feedback           | `case(isnull([Feedback]), "Unknown feedback.", "No feedback.")` | 
| ------------------ | --------------------------------------------------------------- | 
|                    | Unknown feedback.                                               | 
| I like your style. | I like your style.                                              | 
|                    | No feedback.                                                    |

Combine `isnull` with the [`case` expression](./case) to replace "unknown" information with something more descriptive.

If the first row's blank cell is actually a `null`, then `isnull` will return `true`. The `case` statement evaluates `true` to return the first output "Unknown feedback".

If the third row's blank cell is actually an empty string (or even an emoji that blends into your table background), then `isnull` will return `false`, and `case` will return the default output "No feedback".

## Accepted data types

| [Data type][data-types] | Works with `isnull`   |
| ----------------------- | --------------------- |
| String                  | ✅                    |
| Number                  | ✅                    |
| Timestamp               | ✅                    |
| Boolean                 | ✅                    |
| JSON                    | ✅                    |

## Limitations

- `isnull` only accepts one value at a time. If you need to deal with empty cells , see [coalesce](./coalesce).
- In Metabase, you must combine `isnull` with another expression that accepts boolean arguments (i.e., `true` or `false`).

## Converting a function into an `isnull` expression

This section covers functions and formulas that can be used interchangeably with the Metabase `isnull` expression, with notes on how to choose the best option for your use case.

**Metabase expressions**

- [isempty]()

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

## isempty

When combined with `case`, the Metabase `isempty` expression can be used to figure out if a blank cell contains an empty string instead of a `null` value.

```
`case(isempty([Feedback]), "No feedback.", "Unknown feedback.")`
```

is equivalent to the Metabase `isnull` expression:

```
`case(isnull([Feedback]), "Unknown feedback.", [Feedback]="", "No feedback.")`
```

`isempty` cannot be used to check for `null` values.

- Use `isempty` if you're working with columns that have a string data type _and_ your column are non-nullable.
- Use `isnull` if your columns are nullable (or if you're not sure what type of blank values you're dealing with).

### SQL

### Spreadsheets

### Python

