```ts
type StructuredQuery = {
  aggregation: AggregationClause;
  breakout: BreakoutClause;
  expressions: ExpressionClause;
  fields: FieldsClause;
  filter: FilterClause;
  joins: JoinClause;
  limit: LimitClause;
  order-by: OrderByClause;
  source-query: StructuredQuery;
  source-table: SourceTableId;
};
```

## Properties

### aggregation?

```ts
optional aggregation: AggregationClause;
```

---

### breakout?

```ts
optional breakout: BreakoutClause;
```

---

### expressions?

```ts
optional expressions: ExpressionClause;
```

---

### fields?

```ts
optional fields: FieldsClause;
```

---

### filter?

```ts
optional filter: FilterClause;
```

---

### joins?

```ts
optional joins: JoinClause;
```

---

### limit?

```ts
optional limit: LimitClause;
```

---

### order-by?

```ts
optional order-by: OrderByClause;
```

---

### source-query?

```ts
optional source-query: StructuredQuery;
```

---

### source-table?

```ts
optional source-table: SourceTableId;
```
