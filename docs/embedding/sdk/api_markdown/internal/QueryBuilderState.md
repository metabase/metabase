#### Properties

| Property                                                           | Type                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| <a id="cancelquerydeferred"></a> `cancelQueryDeferred`             | `null` \| [`Deferred`](./api_html/Deferred.md)<`void`>                                                 |
| <a id="card"></a> `card`                                           | `null` \| [`Card`](./api_html/Card.md)<[`DatasetQuery`](./api_html/DatasetQuery.md)>                   |
| <a id="currentstate"></a> `currentState`                           | \| `null` \| { `card`: [`Card`](./api_html/Card.md); `cardId`: `number`; `serializedCard`: `string`; } |
| <a id="lastruncard"></a> `lastRunCard`                             | `null` \| [`Card`](./api_html/Card.md)<[`DatasetQuery`](./api_html/DatasetQuery.md)>                   |
| <a id="loadingcontrols"></a> `loadingControls`                     | [`QueryBuilderLoadingControls`](./api_html/QueryBuilderLoadingControls.md)                             |
| <a id="metadatadiff"></a> `metadataDiff`                           | `Record`<`string`, `Partial`<[`Field_2`](./api_html/Field_2.md)>>                                      |
| <a id="originalcard"></a> `originalCard`                           | `null` \| [`Card`](./api_html/Card.md)<[`DatasetQuery`](./api_html/DatasetQuery.md)>                   |
| <a id="parametervalues"></a> `parameterValues`                     | `Record`<`string`, [`ParameterValueOrArray`](./api_html/ParameterValueOrArray.md)>                     |
| <a id="parentdashboard"></a> `parentDashboard`                     | [`QueryBuilderDashboardState`](./api_html/QueryBuilderDashboardState.md)                               |
| <a id="queryresults"></a> `queryResults`                           | `null` \| [`Dataset`](./api_html/Dataset.md)\[]                                                        |
| <a id="querystarttime"></a> `queryStartTime`                       | `null` \| `number`                                                                                     |
| <a id="querystatus"></a> `queryStatus`                             | [`QueryBuilderQueryStatus`](./api_html/QueryBuilderQueryStatus.md)                                     |
| <a id="selectedtimelineeventids"></a> `selectedTimelineEventIds`   | `number`\[]                                                                                            |
| <a id="tableforeignkeyreferences"></a> `tableForeignKeyReferences` | \| `null` \| `Record`<`number`, [`ForeignKeyReference`](./api_html/ForeignKeyReference.md)>            |
| <a id="uicontrols"></a> `uiControls`                               | [`QueryBuilderUIControls`](./api_html/QueryBuilderUIControls.md)                                       |
| <a id="zoomedrowobjectid"></a> `zoomedRowObjectId`                 | `null` \| `string` \| `number`                                                                         |
