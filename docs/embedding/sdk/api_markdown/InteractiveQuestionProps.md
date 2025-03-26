## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="entitytypefilter"></a> `entityTypeFilter?` | [`EntityTypeFilterKeys`](internal/EntityTypeFilterKeys.md)[] | - |
| <a id="initialsqlparameters"></a> `initialSqlParameters?` | [`ParameterValues_2`](internal/ParameterValues_2.md) | Initial values for the SQL parameters |
| <a id="issaveenabled"></a> `isSaveEnabled?` | `boolean` | Is the save question button visible? |
| <a id="onbeforesave"></a> `onBeforeSave?` | (`question`: `undefined` \| [`MetabaseQuestion`](MetabaseQuestion.md), `context`: \{ `isNewQuestion`: `boolean`; \}) => `Promise`\<`void`\> | - |
| <a id="onsave"></a> `onSave?` | (`question`: `undefined` \| [`MetabaseQuestion`](MetabaseQuestion.md), `context`: \{ `isNewQuestion`: `boolean`; \}) => `void` | - |
| <a id="plugins"></a> `plugins?` | [`MetabasePluginsConfig`](MetabasePluginsConfig.md) | - |
| <a id="questionid"></a> `questionId` | `string` \| `number` | - |
| <a id="targetcollection"></a> `targetCollection?` | [`SdkCollectionId`](internal/SdkCollectionId.md) | - |
| <a id="withdownloads"></a> `withDownloads?` | `boolean` | - |
