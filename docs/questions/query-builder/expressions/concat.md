---
title: Concat
---

# Concat

`concat` concatenates data from two or more columns or values, and returns a string.

## Syntax

```
concat(value1, value2, ...)
```

`value1`, `value2` ... can be columns or values. Metabase will convert non-string columns into strings before concatenating their values.

### Example

| Expression                               | Result                   |
| ---------------------------------------- | ------------------------ |
| `concat("Vienna", "Austria")`            | `"ViennaAustria"`        |
| `concat("Vienna", " is in " ,"Austria")` | `"Vienna is in Austria"` |
| `concat([City], " is in " ,[Country])`   | `"Vienna is in Austria"` |

### Metabase will use unformatted values for non-string columns

When you use non-string columns in `concat`, Metabase will ignore any [formatting](../../../data-modeling/formatting.md) that you applied to the columns when converting the column to a string.

For example, if you formatted a number to display only the first two decimal digits in the table results, the results of `concat` would still include additional decimal digits (if any) found in the raw results.

| Formatted display | Value                     | `concat("Result:", " ", [Value])` |
| ----------------- | ------------------------- | --------------------------------- |
| `Kitten`          | `Kitten`                  | `Result: Kitten`                  |
| `17`              | `17`                      | `Result: 17`                      |
| `31.25`           | `31.24823945`             | `Result: 31.24823945`             |
| `42%`             | `0.42`                    | `Result: 0.42`                    |
| `January 1, 2024` | `2025-02-11 21:40:27.892` | `Result: 31.24823945`             |

## Accepted data types

| [Data type](https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types) | Works with `concat` |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| String                                                                                                                         | ✅                  |
| Number                                                                                                                         | ✅                  |
| Timestamp                                                                                                                      | ✅                  |
| Boolean                                                                                                                        | ✅                  |
| JSON                                                                                                                           | ✅                  |

Non-string types will be converted to strings. Regardless of the type of the value passed to `concat`, the result will be a string.

## Related functions

This section covers functions and formulas that work the same way as the Metabase `concat` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor](https://www.metabase.com/glossary/notebook_editor) are converted into SQL queries that run against your database or data warehouse.

If our sample data is stored in a relational database:

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

If our sample data is in a spreadsheet where "City" is in column A, and "Country" in column B, we can create a third column "Location" like this:

```
=CONCATENATE(A2, ", ", B2)
```

which is equivalent to the Metabase `concat` expression:

```
concat([City], ", ", [Country])
```

### Python

Assuming the sample data is in a dataframe column called `df`:

```
df["Location"] = df["City"] + ", " + df["Country"]
```

is the same as the Metabase `concat` expression:

```
concat([City], ", ", [Country])
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/custom-expressions)
