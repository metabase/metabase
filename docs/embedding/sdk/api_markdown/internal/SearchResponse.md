```ts
type SearchResponse<Id, Model, Result> = {
  available_models: SearchModel[];
  data: Result[];
  models: Model[] | null;
  table_db_id: DatabaseId | null;
 } & PaginationResponse;
```

#### Type declaration

| Name               | Type                                               |
| ------------------ | -------------------------------------------------- |
| `available_models` | [`SearchModel`](./api_html/SearchModel.md)\[]      |
| `data`             | `Result`\[]                                        |
| `models`           | `Model`\[] \| `null`                               |
| `table_db_id`      | [`DatabaseId`](./api_html/DatabaseId.md) \| `null` |

#### Type Parameters

| Type Parameter                                                                         | Default type                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Id` *extends* [`SearchResultId`](./api_html/SearchResultId.md)                        | [`SearchResultId`](./api_html/SearchResultId.md)            |
| `Model` *extends* [`SearchModel`](./api_html/SearchModel.md)                           | [`SearchModel`](./api_html/SearchModel.md)                  |
| `Result` *extends* [`BaseSearchResult`](./api_html/BaseSearchResult.md)<`Id`, `Model`> | [`SearchResult`](./api_html/SearchResult.md)<`Id`, `Model`> |
