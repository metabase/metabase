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

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="aggregation"></a> `aggregation`? | [`AggregationClause`](AggregationClause.md) |
| <a id="breakout"></a> `breakout`? | [`BreakoutClause`](BreakoutClause.md) |
| <a id="expressions"></a> `expressions`? | [`ExpressionClause`](ExpressionClause.md) |
| <a id="fields"></a> `fields`? | [`FieldsClause`](FieldsClause.md) |
| <a id="filter"></a> `filter`? | [`FilterClause`](FilterClause.md) |
| <a id="joins"></a> `joins`? | [`JoinClause`](JoinClause.md) |
| <a id="limit"></a> `limit`? | [`LimitClause`](LimitClause.md) |
| <a id="order-by"></a> `order-by`? | [`OrderByClause`](OrderByClause.md) |
| <a id="source-query"></a> `source-query`? | [`StructuredQuery`](StructuredQuery.md) |
| <a id="source-table"></a> `source-table`? | [`SourceTableId`](SourceTableId.md) |
