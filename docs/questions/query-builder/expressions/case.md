---
title: Case
---

# Case

`case` checks if a value matches a list of conditions, and returns some output based on the first condition that's met. Basically, `case` works the same way as ["if... then" logic](#spreadsheets), but it's much nicer to write.

You can optionally tell `case` to return a default output if none of the conditions are met. If you don't set a default output, `case` will return `null` after checking all of your conditions (`null` values are displayed as blank values in Metabase).

Use the `case` expression whenever you need to:

- [bucket a range of values](#bucketing-data-for-frequency-tables-or-histograms),
- [label the rows in your dataset](#labeling-a-row-based-on-conditions-from-multiple-columns), or
- [aggregate rows based on conditional logic](#aggregating-data-based-on-conditions-from-multiple-columns).

| Syntax                                                                |
| --------------------------------------------------------------------- |
| `case(condition1, output1, condition2, output2, ..., default_output)` |
| Returns the output from the first condition that's met.               |

| Example                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- |
| `case(isempty("glass half full"), "empty glass", isnull("glass half full"), "missing glass", "glass half full")` |
| "glass half full"                                                                                                |

## Bucketing data for frequency tables or histograms

| Amount | Bucket |
| ------ | ------ |
| 6      | 0-9    |
| 18     | 10-19  |
| 31     | 30-39  |
| 57     | 50+    |

where **Bucket** is a custom column with the expression:

```
case([Amount] >= 0  AND [Amount] <=  9,  "0-9",
     [Amount] >= 10 AND [Amount] <= 19,  "10-19",
     [Amount] >= 20 AND [Amount] <= 29,  "20-29",
     [Amount] >= 30 AND [Amount] <= 39,  "30-39",
     [Amount] >= 40 AND [Amount] <= 49,  "40-49", "50+")
```

## Labeling a row based on conditions from multiple columns

| Sighting ID | Has Wings | Has Face | Sighting Type |
| ----------- | --------- | -------- | ------------- |
| 1           | True      | True     | Bird          |
| 2           | True      | False    | Plane         |
| 3           | False     | False    | Superman      |
| 4           | False     | True     | Unknown       |

where **Sighting Type** is a custom column with the expression:

```
case([Has Wings] = TRUE  AND [Has Face] = TRUE,  "Bird",
     [Has Wings] = TRUE  AND [Has Face] = FALSE, "Plane",
     [Has Wings] = FALSE AND [Has Face] = TRUE,  "Superman", "Unknown")
```

You can use the columns holding your "labels" to:

- Apply [business definitions or business logic][business-logic] to your datasets.
- [Power a filter][filter-learn].
- [Segment data for data sandboxing][data-sandboxing-docs].

## Aggregating data based on conditions from multiple columns

You can combine `case` with [aggregate functions][aggregate-functions] to only aggregate rows that meet your conditions.

For example, if we want to count the unique number of orders for each order date, but only those with a "Shipped" status:

| Order ID | Order Date | Status    |
| -------- | ---------- | --------- |
| 1        | 2022-04-01 | Paid      |
| 1        | 2022-04-03 | Shipped   |
| 2        | 2022-05-12 | Paid      |
| 2        | 2022-05-12 | Cancelled |

1. Create the custom expression `distinct(case([Status] = "Shipped", [Order ID]))` and name it "Total Orders Shipped".
2. Choose **Order Date** as the group by column.
3. Click **Visualize** to return the result:

| Order Date | Total Orders Shipped |
| ---------- | -------------------- |
| 2022-04-01 | 1                    |
| 2022-05-01 | 0                    |

## Accepted data types

| [Data type][data-types] | Works with `case` |
| ----------------------- | ----------------- |
| String                  | ✅                |
| Number                  | ✅                |
| Timestamp               | ✅                |
| Boolean                 | ✅                |
| JSON                    | ❌                |

## Limitations

All of the outputs must have the same data type.

**Avoid:**:

```
case(condition1, "string", condition2, TRUE, condition3, 1)
```

**Do:**:

```
case(condition1, "string", condition2, "TRUE", condition3, "1")
```

## Related functions

This section covers functions and formulas that can be used interchangeably with the Metabase `case` expression, with notes on how to choose the best option for your use case.

**[Metabase expressions][custom-expressions-list]**

- [Coalesce](#coalesce)
- [Countif](#countif)
- [Sumif](#sumif)

**Other tools**

- [SQL](#sql)
- [Spreadsheets](#spreadsheets)
- [Python](#python)

### Coalesce

Using the table from the [Coalesce: Consolidating values](./coalesce.md#consolidating-values-from-different-columns) example:

| Notes          | Comments          | `coalesce([Notes], [Comments] "No notes or comments.")` |
| -------------- | ----------------- | ------------------------------------------------------- |
| I have a note. | I have a comment. | I have a note.                                          |
|                | I have a comment. | I have a comment.                                       |
| I have a note. |                   | I have a note.                                          |
|                |                   | No notes or comments.                                   |

The [Metabase `coalesce` expression](./coalesce.md)

```
coalesce([Notes], [Comments] "No notes or comments.")
```

is equivalent to the `case` expression

```
case(ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = FALSE, [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = False, [Comments],
     ISBLANK([Notes]) = FALSE AND ISBLANK([Comments]) = TRUE,  [Notes],
     ISBLANK([Notes]) = TRUE  AND ISBLANK([Comments]) = TRUE,  "No notes or comments")
```

`coalesce` is much nicer to write if you don't mind taking the first value when both of your columns are non-blank. Use `case` if you want to define a specific output for this case (such as, "I have a note _and_ a comment").

### Countif

Using the table from the [Aggregating data](#aggregating-data-based-on-conditions-from-multiple-columns) example:

| Order ID | Order Date | Status    |
| -------- | ---------- | --------- |
| 1        | 2022-04-01 | Paid      |
| 1        | 2022-04-03 | Shipped   |
| 2        | 2022-05-12 | Paid      |
| 2        | 2022-05-12 | Cancelled |

The [Metabase `countif` expression][countif]

```
countif(case([Status] = "Shipped"))
```

is equivalent to the `case` expression:

```
count(case([Status] = "Shipped", [Row ID]))
```

`countif` is equivalent to `case` when you are counting **all** rows in the table that meet your conditions. It is **not** equivalent if you want to count **unique** rows that meet your conditions.

### Sumif

Using an expanded version of the table from the [Aggregating data](#aggregating-data-based-on-conditions-from-multiple-columns) example:

| Row ID | Order ID | Order Date | Status    | Amount |
| ------ | -------- | ---------- | --------- | ------ |
| 1      | 1        | 2022-04-01 | Paid      | \$20   |
| 2      | 1        | 2022-04-03 | Shipped   | \$20   |
| 3      | 2        | 2022-05-12 | Paid      | \$80   |
| 4      | 2        | 2022-05-12 | Cancelled | \$80   |

The [Metabase `sumif` expression][sumif]

```
sumif([Amount], [Status] = "Shipped")
```

is equivalent to the `case` expression:

```
sum(case([Status] = "Shipped", [Amount]))
```

`sumif` is equivalent to `case` when you sum a single column for single condition.

You should use `case` if you want to sum a second column under a second, separate condition. For example, if you want to sum the **Amount** column when **Status** = "Shipped" and another (hypothetical) column like **Refunded Amount** when **Status** = "Refunded".

### SQL

In most cases (unless you're using a NoSQL database), questions created from the [notebook editor][notebook-editor-def] are converted into SQL queries that run against your database or data warehouse. Metabase `case` expressions are converted into SQL `CASE WHEN` statements.

Using the table from the [Labeling rows](#labeling-a-row-based-on-conditions-from-multiple-columns) example:

| Sighting ID | Has Wings | Has Face | Sighting Type |
| ----------- | --------- | -------- | ------------- |
| 1           | True      | True     | Bird          |
| 2           | True      | False    | Plane         |
| 3           | False     | False    | Superman      |
| 4           | False     | True     | Unknown       |

The SQL `CASE WHEN` statement:

```sql
SELECT
    CASE WHEN "Has Wings" = TRUE  AND "Has Face" = TRUE  THEN "Bird"
         WHEN "Has Wings" = TRUE  AND "Has Face" = FALSE THEN "Plane"
         WHEN "Has Wings" = FALSE AND "Has Face" = TRUE  THEN "Superman"
         ELSE "Unknown" END
FROM mystery_sightings
```

is equivalent to the `case` expression used for **Sighting Type**:

```
case([Has Wings] = TRUE  AND [Has Face] = TRUE,  "Bird",
     [Has Wings] = TRUE  AND [Has Face] = FALSE, "Plane",
     [Has Wings] = FALSE AND [Has Face] = TRUE,  "Superman", "Unknown")
```

For example, this [SQL trick to order bar charts](https://www.metabase.com/learn/sql-questions/sql-tricks-ordering-charts) could be written using a Metabase `case` expression instead.

### Spreadsheets

Using the table from the [Labeling rows](#labeling-a-row-based-on-conditions-from-multiple-columns) example:

| Sighting ID | Has Wings | Has Face | Sighting Type |
| ----------- | --------- | -------- | ------------- |
| 1           | True      | True     | Bird          |
| 2           | True      | False    | Plane         |
| 3           | False     | False    | Superman      |
| 4           | False     | True     | Unknown       |

The spreadsheet formula

```
=IF(AND(B2 = TRUE, C2 = TRUE), "Bird",
    IF(AND(B2 = TRUE, C2 = FALSE), "Plane",
       IF(AND(B2 = FALSE, C2 = TRUE), "Superman", "Unknown")
      )
    )
```

is equivalent to the `case` expression used for **Sighting Type**:

```
case([Has Wings] = TRUE  AND [Has Face] = TRUE,  "Bird",
     [Has Wings] = TRUE  AND [Has Face] = FALSE, "Plane",
     [Has Wings] = FALSE AND [Has Face] = TRUE,  "Superman", "Unknown")
```

### Python

There are many ways to implement conditional logic using Python. We'll cover the approaches that make sense to convert into Metabase `case` expressions.

Using the table from the [Labeling rows](#labeling-a-row-based-on-conditions-from-multiple-columns) example (and assuming it's in a dataframe called `df`):

| Sighting ID | Has Wings | Has Face | Sighting Type |
| ----------- | --------- | -------- | ------------- |
| 1           | True      | True     | Bird          |
| 2           | True      | False    | Plane         |
| 3           | False     | False    | Superman      |
| 4           | False     | True     | Unknown       |

**[numpy][numpy] select()**

```python
conditions = [
    (df["has_wings"] == True) & (df["has_face"] == True),
    (df["has_wings"] == True) & (df["has_face"] == False),
    (df["has_wings"] == False) & (df["has_face"] == True)]

outputs = ["Bird", "Plane", "Superman"]

df["Sighting Type"] = np.select(conditions, outputs, default="Unknown")
```

**Helper function with [pandas][pandas] apply()**

```python
def Identify(df):
    if ((df["has_wings"] == True) & (df["has_face"] == True)):
        return "Bird"
    elif ((df["has_wings"] == True) & (df["has_face"] == False)):
        return "Plane"
    elif ((df["has_wings"] == False) & (df["has_face"] == True)):
        return "Superman"
    else:
        return "Unknown"

df["Sighting Type"]= df.apply(Identify, axis=1)
```

The approaches above are equivalent to the `case` expression used for **Sighting Type**:

```
case([Has Wings] = TRUE  AND [Has Face] = TRUE,  "Bird",
     [Has Wings] = TRUE  AND [Has Face] = FALSE, "Plane",
     [Has Wings] = FALSE AND [Has Face] = TRUE,  "Superman", "Unknown")
```

## Further reading

- [Custom expressions documentation][custom-expressions-doc]
- [Custom expressions tutorial][custom-expressions-learn]

[aggregate-functions]: ../expressions-list.md#aggregations
[business-logic]: https://www.metabase.com/learn/grow-your-data-skills/analytics/avoiding-data-jargon#create-specific-language-and-shared-definitions
[countif]: ../expressions-list.md#countif
[custom-expressions-doc]: ../expressions.md
[custom-expressions-list]: ../expressions-list.md
[custom-expressions-learn]: https://www.metabase.com/learn/questions/custom-expressions
[data-sandboxing-docs]: ../../../permissions/data-sandboxes.md
[data-types]: https://www.metabase.com/learn/grow-your-data-skills/data-fundamentals/data-types-overview#examples-of-data-types
[filter-learn]: https://www.metabase.com/learn/questions/searching-tables
[notebook-editor-def]: https://www.metabase.com/glossary/notebook_editor
[numpy]: https://numpy.org/doc/
[pandas]: https://pandas.pydata.org/pandas-docs/stable/
[sql-reference-guide]: https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-syntax#common-sql-reference-guides
[sumif]: ./sumif.md
