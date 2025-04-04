```ts
type Join = {
  alias: JoinAlias;
  condition: JoinCondition;
  fields: JoinFields;
  ident: string;
  source-query: StructuredQuery;
  source-table: TableId;
  strategy: JoinStrategy;
};
```

## Properties

### alias?

```ts
optional alias: JoinAlias;
```

---

### condition

```ts
condition: JoinCondition;
```

---

### fields?

```ts
optional fields: JoinFields;
```

---

### ident?

```ts
optional ident: string;
```

---

### source-query?

```ts
optional source-query: StructuredQuery;
```

---

### source-table?

```ts
optional source-table: TableId;
```

---

### strategy?

```ts
optional strategy: JoinStrategy;
```
