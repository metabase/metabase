```ts
type SearchResponse<Id, Model, Result> = {
  available_models: SearchModel[];
  data: Result[];
  models: Model[] | null;
  table_db_id: DatabaseId | null;
} & PaginationResponse;
```

## Type declaration

| Name               | Type                                    |
| ------------------ | --------------------------------------- |
| `available_models` | [`SearchModel`](SearchModel.md)[]       |
| `data`             | `Result`[]                              |
| `models`           | `Model`[] \| `null`                     |
| `table_db_id`      | [`DatabaseId`](DatabaseId.md) \| `null` |

## Type Parameters

| Type Parameter                                                                | Default type                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `Id` _extends_ [`SearchResultId`](SearchResultId.md)                          | [`SearchResultId`](SearchResultId.md)              |
| `Model` _extends_ [`SearchModel`](SearchModel.md)                             | [`SearchModel`](SearchModel.md)                    |
| `Result` _extends_ [`BaseSearchResult`](BaseSearchResult.md)\<`Id`, `Model`\> | [`SearchResult`](SearchResult.md)\<`Id`, `Model`\> |
