```ts
type QueryData<TRow> = {
  columns: DatasetColumn[];
  description?: QueryQuestionResult["description"];
  entityId?: QueryQuestionResult["entityId"] | null;
  id?: QueryQuestionResult["id"] | null;
  name?: QueryQuestionResult["name"] | null;
  rawRows: RowValues[];
  rowCount: number | null;
  rows: TRow[];
  runningTime: number | null;
};
```

## Not Exported

<!-- [<snippet not-exported>] -->

DatasetColumn

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

RowValues

<!-- [<endsnippet not-exported>] -->

## Type Parameters

<!-- [<snippet type-parameters>] -->

| Type Parameter |
| :------------- |
| `TRow`         |

<!-- [<endsnippet type-parameters>] -->

## Properties

<!-- [<snippet properties>] -->

| Property                                | Type                                                                                   |
| :-------------------------------------- | :------------------------------------------------------------------------------------- |
| <a id="columns"></a> `columns`          | `DatasetColumn`[]                                                                      |
| <a id="description"></a> `description?` | [`QueryQuestionResult`](./sdk/api/QueryQuestionResult.md)\[`"description"`\]           |
| <a id="entityid"></a> `entityId?`       | \| [`QueryQuestionResult`](./sdk/api/QueryQuestionResult.md)\[`"entityId"`\] \| `null` |
| <a id="id"></a> `id?`                   | [`QueryQuestionResult`](./sdk/api/QueryQuestionResult.md)\[`"id"`\] \| `null`          |
| <a id="name"></a> `name?`               | \| [`QueryQuestionResult`](./sdk/api/QueryQuestionResult.md)\[`"name"`\] \| `null`     |
| <a id="rawrows"></a> `rawRows`          | `RowValues`[]                                                                          |
| <a id="rowcount"></a> `rowCount`        | `number` \| `null`                                                                     |
| <a id="rows"></a> `rows`                | `TRow`[]                                                                               |
| <a id="runningtime"></a> `runningTime`  | `number` \| `null`                                                                     |

<!-- [<endsnippet properties>] -->
