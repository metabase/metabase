---
title: Substring
---

# Substring

`substring` extracts part of some text. This function is useful for cleaning up text (or any value with a [string data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types)) that has a consistent format.

For example, `substring` should work well on strings like SKU numbers, ISO codes, and standardized email addresses.

| Syntax                                                                                           | Example                               |
|--------------------------------------------------------------------------------------------------|---------------------------------------|
| `substring(text, position, length)`                                                              | `substring("user_id@email.com", 1, 7)`|
| Extracts part of the text given a starting point (position) and a length (number of characters). | "user_id"                             |

## Parameters

- The first character in your string is at position 1.
- The length of your substring should always be a positive number.

## Getting a substring from the left

| Mission ID  | Agent |
|-------------|-------|
| 19951113006 | 006   |
| 20061114007 | 007   |
| 19640917008 | 008   |

**Agent** is a custom column with the expression:

```
substring([Mission ID], 9, 3)
```

## Getting a substring from the right

Instead of using a number for the position, you'll use the formula

```
1 + length([column]) - position_from_right
```

where `position_from_right` is the number of characters you want to count from right to left.

| Mission ID  | Agent |
|-------------|-------|
| 19951113006 | 006   |
| 20061114007 | 007   |
| 19640917008 | 008   |

Here, **Agent** is a custom column with the expression:

```
substring([Mission ID], (1 + length([Mission ID]) - 3), 3)
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `substring`  |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Limitations

`substring` extracts text by counting a fixed number of characters. If you need to extract text based on some more complicated logic, try [`regexextract`](../expressions-list.md#regexextract).

And if you only need to clean up extra whitespace around your text, you can use the [`trim`](../expressions-list.md#trim), [`ltrim`](../expressions-list.md#ltrim), or [`rtrim`](../expressions-list.md#rtrim) expressions instead.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `substring` expression, with notes on how to choose the best option for your use case.

**[Metabase expressions](../expressions-list.md)**

- [regexextract](#regexextract)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### Regexextract

Use [regexextract](./regexextract.md) if you need to extract text based on more specific rules. For example, you could get the agent ID with a regex pattern that finds the last occurrence of "00" (and everything after it):

```
regexextract([Mission ID], ".+(00.+)$")
```

should return the same result as

```
substring([Mission ID], 9, 3)
```

### SQL

When you run a question using the [notebook editor](https://www.metabase.com/glossary/notebook_editor), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [sample data](#getting-a-substring-from-the-left) is stored in a PostgreSQL database:

```sql
SELECT
    mission_id,
    SUBSTRING(mission_id, 9, 3) AS agent
FROM
    this_message_will_self_destruct;
```

is equivalent to the Metabase `substring` expression:

```
substring([Mission ID], 9, 3)
```

### Spreadsheets

If our [sample data](#getting-a-substring-from-the-left) is in a spreadsheet where "Mission ID" is in column A,

```
=mid(A2,9,3)
```

is the same as the Metabase `substring` expression:

```
substring([Mission ID], 9, 3)
```

### Python

Assuming the [sample data](#getting-a-substring-from-the-left) is in a dataframe column called `df`,

```
df['Agent'] = df['Mission ID'].str.slice(8, 11)
```

does the same thing as the Metabase `substring` expression:

```
substring([Mission ID], 9, 3)
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
