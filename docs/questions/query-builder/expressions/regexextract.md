---
title: Regexextract
---

# Regexextract

> ⚠️ `regexextract` is unavailable for MongoDB, SQLite, and SQL Server. For Druid, `regexextract` is only available for the Druid-JDBC driver.

`regexextract` uses [regular expressions (regex)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) to get a specific part of your text.

`regexextract` is ideal for text that has little to no structure, like URLs or freeform survey responses. If you're working with strings in predictable formats like SKU numbers, IDs, or other types of codes, check out the simpler [substring](../expressions/substring.md) expression instead.

Use `regexextract` to create custom columns with shorter, more readable labels for things like:

- filter dropdown menus,
- chart labels, or
- embedding parameters.

| Syntax                                                        | Example                                 |
|---------------------------------------------------------------|-----------------------------------------|
| `regexextract(text, regular_expression)`                      | `regexextract("regexextract", "ex(.*)")`|
| Gets a specific part of your text using a regular expression. | "extract"                               |

## Searching and cleaning text

Let's say that you have web data with a lot of different URLs, and you want to map each URL to a shorter, more readable campaign name.

| URL                                                   | Campaign Name |
|-------------------------------------------------------|---------------|
| https://www.metabase.com/docs/?utm_campaign=alice     | alice         |
| https://www.metabase.com/learn/?utm_campaign=neo      | neo           |
| https://www.metabase.com/glossary/?utm_campaign=candy | candy         |

You can create a custom column **Campaign Name** with the expression:

```
regexextract([URL], "^[^?#]+\?utm_campaign=(.*)")
```

Here, the regex pattern [`^[^?#]+\?` matches all valid URL strings](https://www.oreilly.com/library/view/regular-expressions-cookbook/9780596802837/ch07s13.html). You can replace `utm_campaign=` with whatever query parameter you like. At the end of the regex pattern, the [capturing group](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Groups_and_Backreferences) `(.*)` gets all of the characters that appear after the query parameter `utm_campaign=`.

Now, you can use **Campaign Name** in places where you need clean labels, such as [filter dropdown menus](../../../dashboards/filters.md), [charts](../../sharing/visualizing-results.md), and [embedding parameters](../../../embedding/static-embedding-parameters.md).

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `regexextract`  |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Limitations

`regexextract` is unavailable for MongoDB, SQLite, and SQL Server. For Druid, `regexextract` is only available for the Druid-JDBC driver.

Regex can be a dark art. You have been warned.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `regexextract` expression, with notes on how to choose the best option for your use case.

**[Metabase expressions](../expressions-list.md)**

- [substring](#substring)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### Substring

Use [substring](../expressions/substring.md) when you want to search text that has a consistent format (the same number of characters, and the same relative order of those characters).

For example, you wouldn't be able to use `substring` to get the query parameter from the [URL sample data](#searching-and-cleaning-text), because the URL paths and the parameter names both have variable lengths.

But if you wanted to pull out everything after `https://www.` and before `.com`, you could do that with either:

```
substring([URL], 13, 8)
```

or

```
regexextract([URL], "^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/.\n]+)")
```

### SQL

When you run a question using the [notebook editor](https://www.metabase.com/glossary/notebook_editor), Metabase will convert your graphical query settings (filters, summaries, etc.) into a query, and run that query against your database to get your results.

If our [sample data](#searching-and-cleaning-text) is stored in a PostgreSQL database:

```sql
SELECT
    url,
    SUBSTRING(url, '^[^?#]+\?utm_campaign=(.*)') AS campaign_name
FROM follow_the_white_rabbit
```

is equivalent to the Metabase `regexextract` expression:

```
regexextract([URL], "^[^?#]+\?utm_campaign=(.*)")
```

### Spreadsheets

If our [sample data](#searching-and-cleaning-text) is in a spreadsheet where "URL" is in column A, the spreadsheet function

```
regexextract(A2, "^[^?#]+\?utm_campaign=(.*)")
```

uses pretty much the same syntax as the Metabase expression:

```
regexextract([URL], "^[^?#]+\?utm_campaign=(.*)")
```

### Python

Assuming the [sample data](#searching-and-cleaning-text) is in a dataframe column called `df`,

```
df['Campaign Name'] = df['URL'].str.extract(r'^[^?#]+\?utm_campaign=(.*)')
```

does the same thing as the Metabase `regexextract` expression:

```
regexextract([URL], "^[^?#]+\?utm_campaign=(.*)")
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
