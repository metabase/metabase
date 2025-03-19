```ts
type QuestionCreatorOpts = {
  cardType: CardType;
  collectionId: CollectionId;
  dashboardId: DashboardId;
  databaseId: DatabaseId;
  dataset_query: DatasetQuery;
  display: CardDisplayType;
  metadata: Metadata;
  name: string;
  parameterValues: ParameterValuesMap;
  tableId: TableId;
  type: "query" | "native";
  visualization_settings: VisualizationSettings;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="cardtype"></a> `cardType`? | [`CardType`](CardType.md) |
| <a id="collectionid"></a> `collectionId`? | [`CollectionId`](CollectionId.md) |
| <a id="dashboardid"></a> `dashboardId`? | [`DashboardId`](DashboardId.md) |
| <a id="databaseid"></a> `databaseId`? | [`DatabaseId`](DatabaseId.md) |
| <a id="dataset_query"></a> `dataset_query`? | [`DatasetQuery`](DatasetQuery.md) |
| <a id="display"></a> `display`? | [`CardDisplayType`](CardDisplayType.md) |
| <a id="metadata"></a> `metadata`? | [`Metadata`](../classes/Metadata.md) |
| <a id="name"></a> `name`? | `string` |
| <a id="parametervalues"></a> `parameterValues`? | [`ParameterValuesMap`](ParameterValuesMap.md) |
| <a id="tableid"></a> `tableId`? | [`TableId`](TableId.md) |
| <a id="type"></a> `type`? | `"query"` \| `"native"` |
| <a id="visualization_settings"></a> `visualization_settings`? | [`VisualizationSettings`](VisualizationSettings.md) |
