```ts
type QueryQuestionResult = {
  columns: DatasetColumn[];
  description: MetabaseQuestion["description"];
  entityId: MetabaseQuestion["entityId"];
  id: MetabaseQuestion["id"];
  name: MetabaseQuestion["name"];
  rowCount: number | null;
  rows: RowValues[];
  runningTime: number | null;
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                               | Type                                                               |
| :------------------------------------- | :----------------------------------------------------------------- |
| <a id="columns"></a> `columns`         | `DatasetColumn`[]                                                  |
| <a id="description"></a> `description` | [`MetabaseQuestion`](./api/MetabaseQuestion.md)\[`"description"`\] |
| <a id="entityid"></a> `entityId`       | [`MetabaseQuestion`](./api/MetabaseQuestion.md)\[`"entityId"`\]    |
| <a id="id"></a> `id`                   | [`MetabaseQuestion`](./api/MetabaseQuestion.md)\[`"id"`\]          |
| <a id="name"></a> `name`               | [`MetabaseQuestion`](./api/MetabaseQuestion.md)\[`"name"`\]        |
| <a id="rowcount"></a> `rowCount`       | `number` \| `null`                                                 |
| <a id="rows"></a> `rows`               | `RowValues`[]                                                      |
| <a id="runningtime"></a> `runningTime` | `number` \| `null`                                                 |

<!-- [<endsnippet properties>] -->
