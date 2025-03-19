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

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="alias"></a> `alias`? | [`JoinAlias`](JoinAlias.md) |
| <a id="condition"></a> `condition` | [`JoinCondition`](JoinCondition.md) |
| <a id="fields"></a> `fields`? | [`JoinFields`](JoinFields.md) |
| <a id="ident"></a> `ident`? | `string` |
| <a id="source-query"></a> `source-query`? | [`StructuredQuery`](StructuredQuery.md) |
| <a id="source-table"></a> `source-table`? | [`TableId`](TableId.md) |
| <a id="strategy"></a> `strategy`? | [`JoinStrategy`](JoinStrategy.md) |
