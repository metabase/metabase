#### Extends

* `Omit`<[`CreateDashboardProperties`](internal/CreateDashboardProperties.md), `"collection_id"`>

#### Properties

| Property                                 | Type                                             | Description                                                                                                    | Inherited from     |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| <a id="collectionid"></a> `collectionId` | [`SdkCollectionId`](internal/SdkCollectionId.md) | Collection in which to create a new dashboard. You can use predefined system values like `root` or `personal`. | -                  |
| <a id="description"></a> `description`   | `null` \| `string`                               | Dashboard description                                                                                          | `Omit.description` |
| <a id="name"></a> `name`                 | `string`                                         | Dashboard title                                                                                                | `Omit.name`        |
