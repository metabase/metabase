## Properties

| Property | Type |
| ------ | ------ |
| <a id="cancelquerydeferred"></a> `cancelQueryDeferred` | `null` \| [`Deferred`](Deferred.md)\<`void`\> |
| <a id="card"></a> `card` | `null` \| [`Card`](Card.md)\<[`DatasetQuery`](DatasetQuery.md)\> |
| <a id="currentstate"></a> `currentState` | \| `null` \| \{ `card`: [`Card`](Card.md); `cardId`: `number`; `serializedCard`: `string`; \} |
| <a id="lastruncard"></a> `lastRunCard` | `null` \| [`Card`](Card.md)\<[`DatasetQuery`](DatasetQuery.md)\> |
| <a id="loadingcontrols"></a> `loadingControls` | [`QueryBuilderLoadingControls`](QueryBuilderLoadingControls.md) |
| <a id="metadatadiff"></a> `metadataDiff` | `Record`\<`string`, `Partial`\<[`Field_2`](Field_2.md)\>\> |
| <a id="originalcard"></a> `originalCard` | `null` \| [`Card`](Card.md)\<[`DatasetQuery`](DatasetQuery.md)\> |
| <a id="parametervalues"></a> `parameterValues` | `Record`\<`string`, [`ParameterValueOrArray`](ParameterValueOrArray.md)\> |
| <a id="parentdashboard"></a> `parentDashboard` | [`QueryBuilderDashboardState`](QueryBuilderDashboardState.md) |
| <a id="queryresults"></a> `queryResults` | `null` \| [`Dataset`](Dataset.md)[] |
| <a id="querystarttime"></a> `queryStartTime` | `null` \| `number` |
| <a id="querystatus"></a> `queryStatus` | [`QueryBuilderQueryStatus`](QueryBuilderQueryStatus.md) |
| <a id="selectedtimelineeventids"></a> `selectedTimelineEventIds` | `number`[] |
| <a id="tableforeignkeyreferences"></a> `tableForeignKeyReferences` | \| `null` \| `Record`\<`number`, [`ForeignKeyReference`](ForeignKeyReference.md)\> |
| <a id="uicontrols"></a> `uiControls` | [`QueryBuilderUIControls`](QueryBuilderUIControls.md) |
| <a id="zoomedrowobjectid"></a> `zoomedRowObjectId` | `null` \| `string` \| `number` |
