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

| Property                                                   | Type                                                                                        |
| :--------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| <a id="queryquestionresult-columns"></a> `columns`         | `DatasetColumn`[]                                                                           |
| <a id="queryquestionresult-description"></a> `description` | [`MetabaseQuestion`](/docs/latest/embedding/sdk/api/MetabaseQuestion.md)\[`"description"`\] |
| <a id="queryquestionresult-entityid"></a> `entityId`       | [`MetabaseQuestion`](/docs/latest/embedding/sdk/api/MetabaseQuestion.md)\[`"entityId"`\]    |
| <a id="queryquestionresult-id"></a> `id`                   | [`MetabaseQuestion`](/docs/latest/embedding/sdk/api/MetabaseQuestion.md)\[`"id"`\]          |
| <a id="queryquestionresult-name"></a> `name`               | [`MetabaseQuestion`](/docs/latest/embedding/sdk/api/MetabaseQuestion.md)\[`"name"`\]        |
| <a id="queryquestionresult-rowcount"></a> `rowCount`       | `number` \| `null`                                                                          |
| <a id="queryquestionresult-rows"></a> `rows`               | `RowValues`[]                                                                               |
| <a id="queryquestionresult-runningtime"></a> `runningTime` | `number` \| `null`                                                                          |

<!-- [<endsnippet properties>] -->
