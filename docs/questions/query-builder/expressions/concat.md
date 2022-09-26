---
title: Concat
---

# Concat

`concat` joins text data (strings) from two or more columns.

| Syntax                        | Example                                 |
|-------------------------------|-----------------------------------------|
| concat(value1, value2, ...)   | concat("San Francisco, ", "California") |
| Combines two or more strings. | "San Francisco, California"             |

## Combining text from different columns 

| City          | State         | Location                  |
|---------------|---------------|---------------------------|
| San Francisco | California    | San Francisco, California |
| Boston        | Massachusetts | Boston, Massachusetts     |
| New York      | New York      | New York, New York        |

where **Location** is a custom column with the expression:

```
CONCAT([City], ", ", [State])
```

## Accepted data types

| [Data type][data-types] | Works with `concat`  |
| ----------------------- | -------------------- |
| String                  | ✅                   |
| Number                  | ❌                   |
| Timestamp               | ❌                   |
| Boolean                 | ❌                   |
| JSON                    | ❌                   |

## Converting a function into an `concat` expression

This section covers functions and formulas that can be used interchangeably with the Metabase `concat` expression, with notes on how to choose the best option for your use case.

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse.

```sql
SELECT
    CONCAT(City, ", ", State) AS "Location"
FROM
    People;
```

is equivalent to the Metabase `concat` expression:

```
concat([City], ",", [State])
```

### Spreadsheets

If our [sample data](#combining-text-from-different-columns) is in a spreadsheet where "City" is in column A, and "State" in column B, we can create a third column "Location" like this:

```
=CONCATENATE(A2, ", ", B2)
```

which is equivalent to the Metabase `concat` expression:

```
concat([City], ",", [State])
```

### Python

Assuming the [sample data](#combining-text-from-different-columns) is in a dataframe column called df:

```
df["Location"] = df["City"] + ", " + df["State"]
```

is equivalent to the Metabase `isempty` expression:

```
concat([City], ",", [State])
```

## Further reading

- [Custom expressions documentation](../expressions.md)
- [Custom expressions tutorial](https://www.metabase.com/learn/questions/)