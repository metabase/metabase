**`Expand`**

## Properties

<!-- [<snippet properties>] -->

| Property                                                                          | Type                                                                                                | Description                                                                                                        |
| :-------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| <a id="createdashboardmodalprops-initialcollectionid"></a> `initialCollectionId?` | [`SdkCollectionId`](/docs/latest/embedding/sdk/api/SdkCollectionId.md)                              | Initial collection in which to create a dashboard. You can use predefined system values like `root` or `personal`. |
| <a id="createdashboardmodalprops-isopen"></a> `isOpen?`                           | `boolean`                                                                                           | Whether the modal is open or not.                                                                                  |
| <a id="createdashboardmodalprops-onclose"></a> `onClose?`                         | () => `void`                                                                                        | Handler to close modal component                                                                                   |
| <a id="createdashboardmodalprops-oncreate"></a> `onCreate`                        | (`dashboard`: [`MetabaseDashboard`](/docs/latest/embedding/sdk/api/MetabaseDashboard.md)) => `void` | Handler to react on dashboard creation.                                                                            |
| <a id="createdashboardmodalprops-targetcollection"></a> `targetCollection?`       | [`SdkCollectionId`](/docs/latest/embedding/sdk/api/SdkCollectionId.md)                              | The collection to save the dashboard to. This will hide the collection picker from the save modal.                 |

<!-- [<endsnippet properties>] -->
