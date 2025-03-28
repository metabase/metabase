```ts
type SearchResponse<Id, Model, Result> = {
  available_models: SearchModel[];
  data: Result[];
  models: Model[] | null;
  table_db_id: DatabaseId | null;
 } & PaginationResponse;
```

#### Type declaration

| Name               | Type                                                     |
| ------------------ | -------------------------------------------------------- |
| `available_models` | [`SearchModel`](./generated/html/SearchModel.md)\[]      |
| `data`             | `Result`\[]                                              |
| `models`           | `Model`\[] \| `null`                                     |
| `table_db_id`      | [`DatabaseId`](./generated/html/DatabaseId.md) \| `null` |

#### Type Parameters

| Type Parameter                                                                               | Default type                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Id` *extends* [`SearchResultId`](./generated/html/SearchResultId.md)                        | [`SearchResultId`](./generated/html/SearchResultId.md)            |
| `Model` *extends* [`SearchModel`](./generated/html/SearchModel.md)                           | [`SearchModel`](./generated/html/SearchModel.md)                  |
| `Result` *extends* [`BaseSearchResult`](./generated/html/BaseSearchResult.md)<`Id`, `Model`> | [`SearchResult`](./generated/html/SearchResult.md)<`Id`, `Model`> |
