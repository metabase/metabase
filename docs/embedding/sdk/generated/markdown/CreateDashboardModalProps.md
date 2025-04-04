## Properties

| Property                                                | Type                                                                 | Description                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| <a id="initialcollectionid"></a> `initialCollectionId?` | [`SdkCollectionId`](internal/SdkCollectionId.md)                     | Initial collection in which to create a dashboard. You can use predefined system values like `root` or `personal`. |
| <a id="isopen"></a> `isOpen?`                           | `boolean`                                                            | Whether the modal is open or not.                                                                                  |
| <a id="onclose"></a> `onClose?`                         | () => `void`                                                         | Handler to close modal component                                                                                   |
| <a id="oncreate"></a> `onCreate`                        | (`dashboard`: [`MetabaseDashboard`](MetabaseDashboard.md)) => `void` | Handler to react on dashboard creation.                                                                            |
