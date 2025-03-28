```ts
type SearchResponse<Id, Model, Result> = {
  available_models: SearchModel[];
  data: Result[];
  models: Model[] | null;
  table_db_id: DatabaseId | null;
 } & PaginationResponse;
```

#### Type declaration

| Name               | Type                                    |
| ------------------ | --------------------------------------- |
| `available_models` | [`SearchModel`](SearchModel.md)\[]      |
| `data`             | `Result`\[]                             |
| `models`           | `Model`\[] \| `null`                    |
| `table_db_id`      | [`DatabaseId`](DatabaseId.md) \| `null` |

#### Type Parameters

| Type Parameter                                                              | Default type                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| `Id` *extends* [`SearchResultId`](SearchResultId.md)                        | [`SearchResultId`](SearchResultId.md)            |
| `Model` *extends* [`SearchModel`](SearchModel.md)                           | [`SearchModel`](SearchModel.md)                  |
| `Result` *extends* [`BaseSearchResult`](BaseSearchResult.md)<`Id`, `Model`> | [`SearchResult`](SearchResult.md)<`Id`, `Model`> |
