```ts
type MetabaseCollectionItem = {
  description: string | null;
  entity_id: SdkEntityId;
  id: SdkCollectionId;
  last-edit-info: {
     email: string;
     first_name: string;
     id: SdkUserId;
     last_name: string;
     timestamp: string;
  };
  model: string;
  name: string;
  type: "instance-analytics" | "trash" | "model" | "question" | "metric" | null;
};
```

The CollectionItem entity

## Properties

<!-- [<snippet properties>] -->

| Property                                      | Type                                                                                                                                    |
| :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="description"></a> `description`        | `string` \| `null`                                                                                                                      |
| <a id="entity_id"></a> `entity_id?`           | [`SdkEntityId`](./api/SdkEntityId.md)                                                                                                   |
| <a id="id"></a> `id`                          | [`SdkCollectionId`](./api/SdkCollectionId.md)                                                                                           |
| <a id="last-edit-info"></a> `last-edit-info?` | \{ `email`: `string`; `first_name`: `string`; `id`: [`SdkUserId`](./api/SdkUserId.md); `last_name`: `string`; `timestamp`: `string`; \} |
| `last-edit-info.email`                        | `string`                                                                                                                                |
| `last-edit-info.first_name`                   | `string`                                                                                                                                |
| `last-edit-info.id`                           | [`SdkUserId`](./api/SdkUserId.md)                                                                                                       |
| `last-edit-info.last_name`                    | `string`                                                                                                                                |
| `last-edit-info.timestamp`                    | `string`                                                                                                                                |
| <a id="model"></a> `model`                    | `string`                                                                                                                                |
| <a id="name"></a> `name`                      | `string`                                                                                                                                |
| <a id="type"></a> `type?`                     | `"instance-analytics"` \| `"trash"` \| `"model"` \| `"question"` \| `"metric"` \| `null`                                                |

<!-- [<endsnippet properties>] -->
