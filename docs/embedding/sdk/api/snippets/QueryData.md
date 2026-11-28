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

| Property                                          | Type                                                                                                        |
| :------------------------------------------------ | :---------------------------------------------------------------------------------------------------------- |
| <a id="querydata-columns"></a> `columns`          | `DatasetColumn`[]                                                                                           |
| <a id="querydata-description"></a> `description?` | [`QueryQuestionResult`](/docs/latest/embedding/sdk/api/QueryQuestionResult.md)\[`"description"`\]           |
| <a id="querydata-entityid"></a> `entityId?`       | \| [`QueryQuestionResult`](/docs/latest/embedding/sdk/api/QueryQuestionResult.md)\[`"entityId"`\] \| `null` |
| <a id="querydata-id"></a> `id?`                   | [`QueryQuestionResult`](/docs/latest/embedding/sdk/api/QueryQuestionResult.md)\[`"id"`\] \| `null`          |
| <a id="querydata-name"></a> `name?`               | \| [`QueryQuestionResult`](/docs/latest/embedding/sdk/api/QueryQuestionResult.md)\[`"name"`\] \| `null`     |
| <a id="querydata-rawrows"></a> `rawRows`          | `RowValues`[]                                                                                               |
| <a id="querydata-rowcount"></a> `rowCount`        | `number` \| `null`                                                                                          |
| <a id="querydata-rows"></a> `rows`                | `TRow`[]                                                                                                    |
| <a id="querydata-runningtime"></a> `runningTime`  | `number` \| `null`                                                                                          |

<!-- [<endsnippet properties>] -->
