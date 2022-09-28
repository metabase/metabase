---
title: Substring
---

# Substring

`substring` extracts part of some text. This function is useful for cleaning up text data (i.e., columns with a [string data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types)) that has a consistent format.

For example, `substring` should work well on strings such as SKU numbers, ISO codes, or standardized email addresses.

| `substring(text, position, length)`                                                              | `substring("user_id@email.com", 1, 7) |
|--------------------------------------------------------------------------------------------------|---------------------------------------|
| Extracts part of the text given a starting point (position) and a length (number of characters). | "user_id"                             |

## Parameters

- Generally, position should be a positive number. 
- The first character in your string is at position 1.
- Some databases support negative numbers for position, so that you can reference the last character at position -1.
- Length should always be a positive number.

## Cleaning text data

| Mission ID  | Agent |
|-------------|-------|
| 19951113006 | 006   |
| 20061114007 | 007   |
| 19640917008 | 008   |

where **Agent** is a custom column with the expression:

```
substring([Mission ID], 9, 3)
```

If your database supports negative starting positions, you could also use:

```
substring([Mission ID], -3, 3)
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/databases/data-types-overview#examples-of-data-types) | Works with `substring`  |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Limitations

`substring` extracts text by counting characters from left to right. If you need to extract text based on some more complicated logic, try [`regexextract`](../expressions-list.md#regexextract).

And if you only need to clean up extra whitespace around your text, you can use the [`trim`](../expressions-list.md#trim), [`lefttrim`](../expressions-list.md#lefttrim), or [`righttrim`](../expressions-list.md#righttrim) expressions instead.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `substring` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor](https://www.metabase.com/glossary/notebook_editor) are converted into SQL queries that run against your database or data warehouse. 

If our [sample data](#cleaning-text-data) is stored in a relational database:

```sql
SELECT
    mission_id,
    substring(mission_id, 9, 3) AS agent
FROM
    this_message_will_self_destruct;
```

is equivalent to the Metabase `substring` expression:

```
substring([Mission ID], 9, 3)
```

### Spreadsheets

If our [sample data](#cleaning-text-data) is in a spreadsheet where "Mission ID" is in column A,

```
=mid(A2,9,3)
```

is equivalent to the Metabase `substring` expression:

```
substring([Mission ID], 9, 3)
```

### Python

Assuming the [sample data](#cleaning-text-data) is in a dataframe column called df,

```
df['Agent'] = df['Mission ID'].str.slice(8, 11)
```

would do the same thing as the Metabase `substring` expression:

```
substring([Mission ID], 9, 3)
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/)
