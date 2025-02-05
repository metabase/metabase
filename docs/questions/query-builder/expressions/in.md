---
title: In
---

# In

`in` compares values and returns true if `value1` equals `value2` (OR `value3`, etc., if specified).

## Syntax

```
in(value1, value2, ...)
```

`value1` is the column or value to check.

`value2, ...` is the list of columns or values to check.

Metabase will return rows where the `value1` equals `value2` OR `value3`, etc. Matches must be exact (e.g., strings are case sensitive).

For example,

```
in([Category], "Gadget", "Widget")
```
would return rows where `[Category]` is either `Gadget` or `Widget`. 


You can choose multiple columns. For example, let's say you wanted to find records where `[Title]` or `[Category]` fields are equal to `Gadget`. You could write:

```
in("Gadget", [Title], [Category])
```

## Related functions

### SQL

`in` works like SQL's `in` function.

So if you have the expression: `in[title], "Lightweight Wool Computer", "Aerodynamic Cotton Lamp")`, in SQL, it would be:

```sql
title IN ('Lightweight Wool Computer', 'Aerodynamic Cotton Lamp')
```

But under the hood, Metabase translates this `IN` expression to a `WHERE` clause that uses the `OR` operator:

```sql
WHERE
  title = 'Lightweight Wool Computer'
  OR title = 'Aerodynamic Cotton Lamp'
```

## Accepted data types

| Data type | Works with `in` |
| --------- | --------------- |
| String    | ✅              |
| Number    | ✅              |
| Timestamp | ❌              |
| Boolean   | ✅              |
| JSON      | ❌              |
