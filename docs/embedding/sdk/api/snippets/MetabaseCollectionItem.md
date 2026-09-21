```ts
type MetabaseCollectionItem = {
  collection_namespace?: string | null;
  description: string | null;
  entity_id?: SdkEntityId;
  id: SdkCollectionId;
  is_remote_synced?: boolean;
  last-edit-info?: {
     email: string;
     first_name: string | null;
     id: SdkUserId;
     last_name: string | null;
     timestamp: string;
  };
  model: string;
  name: string;
  namespace?: string | null;
  type?:   | "instance-analytics"
     | "trash"
     | "remote-synced"
     | "library"
     | "library-data"
     | "library-metrics"
     | "shared-tenant-collection"
     | "tenant-specific-root-collection"
     | "model"
     | "question"
     | "metric"
     | null;
};
```

The CollectionItem entity

## Properties

<!-- [<snippet properties>] -->

| Property                                                  | Type                                                                                                                                                                                                                                              |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="collection_namespace"></a> `collection_namespace?` | `string` \| `null`                                                                                                                                                                                                                                |
| <a id="description"></a> `description`                    | `string` \| `null`                                                                                                                                                                                                                                |
| <a id="entity_id"></a> `entity_id?`                       | [`SdkEntityId`](./api/SdkEntityId.md)                                                                                                                                                                                                             |
| <a id="id"></a> `id`                                      | [`SdkCollectionId`](./api/SdkCollectionId.md)                                                                                                                                                                                                     |
| <a id="is_remote_synced"></a> `is_remote_synced?`         | `boolean`                                                                                                                                                                                                                                         |
| <a id="last-edit-info"></a> `last-edit-info?`             | \{ `email`: `string`; `first_name`: `string` \| `null`; `id`: [`SdkUserId`](./api/SdkUserId.md); `last_name`: `string` \| `null`; `timestamp`: `string`; \}                                                                                       |
| `last-edit-info.email`                                    | `string`                                                                                                                                                                                                                                          |
| `last-edit-info.first_name`                               | `string` \| `null`                                                                                                                                                                                                                                |
| `last-edit-info.id`                                       | [`SdkUserId`](./api/SdkUserId.md)                                                                                                                                                                                                                 |
| `last-edit-info.last_name`                                | `string` \| `null`                                                                                                                                                                                                                                |
| `last-edit-info.timestamp`                                | `string`                                                                                                                                                                                                                                          |
| <a id="model"></a> `model`                                | `string`                                                                                                                                                                                                                                          |
| <a id="name"></a> `name`                                  | `string`                                                                                                                                                                                                                                          |
| <a id="namespace"></a> `namespace?`                       | `string` \| `null`                                                                                                                                                                                                                                |
| <a id="type"></a> `type?`                                 | \| `"instance-analytics"` \| `"trash"` \| `"remote-synced"` \| `"library"` \| `"library-data"` \| `"library-metrics"` \| `"shared-tenant-collection"` \| `"tenant-specific-root-collection"` \| `"model"` \| `"question"` \| `"metric"` \| `null` |

<!-- [<endsnippet properties>] -->
