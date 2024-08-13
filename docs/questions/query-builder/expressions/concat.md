---
title: Concat
---

# Concat

`concat` joins text data (strings) from two or more columns.

| Syntax                        | Example                                  |
|-------------------------------|------------------------------------------|
| `concat(value1, value2, ...)` | `concat("Vienna, ", "Austria")`|
| Combines two or more strings. | "Vienna, Austria"              |

## Combining text from different columns

| City     | Country | Location         |
|----------|---------|------------------|
| Vienna   | Austria | Vienna, Austria  |
| Paris    | France  | Paris, France    |
| Kalamata | Greece  | Kalamata, Greece |

where **Location** is a custom column with the expression:

```
CONCAT([City], ", ", [Country])
```

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `concat`  |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Related functions

This section covers functions and formulas that work the same way as the Metabase `concat` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor](https://www.metabase.com/glossary/notebook_editor) are converted into SQL queries that run against your database or data warehouse.

If our [sample data](#combining-text-from-different-columns) is stored in a relational database:

```sql
SELECT
    CONCAT(City, ", ", Country) AS "Location"
FROM
    richard_linklater_films;
```

is equivalent to the Metabase `concat` expression:

```
concat([City], ", ", [Country])
```

### Spreadsheets

If our [sample data](#combining-text-from-different-columns) is in a spreadsheet where "City" is in column A, and "Country" in column B, we can create a third column "Location" like this,

```
=CONCATENATE(A2, ", ", B2)
```

which is equivalent to the Metabase `concat` expression:

```
concat([City], ", ", [Country])
```

### Python

Assuming the [sample data](#combining-text-from-different-columns) is in a dataframe column called df,

```
df["Location"] = df["City"] + ", " + df["Country"]
```

is the same as the Metabase `concat` expression:

```
concat([City], ", ", [Country])
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/custom-expressions)
