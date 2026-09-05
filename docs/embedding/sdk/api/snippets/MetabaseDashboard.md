```ts
type MetabaseDashboard = {
  collection?: MetabaseCollection | null;
  created_at: string;
  description: string | null;
  entity_id: SdkEntityId;
  id: SdkDashboardId;
  last-edit-info: {
     email: string;
     first_name: string;
     id: number;
     last_name: string;
     timestamp: string;
  };
  name: string;
  updated_at: string;
};
```

The Dashboard entity

## Properties

<!-- [<snippet properties>] -->

| Property                                     | Type                                                                                                           |
| :------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| <a id="collection"></a> `collection?`        | [`MetabaseCollection`](./api/MetabaseCollection.md) \| `null`                                                  |
| <a id="created_at"></a> `created_at`         | `string`                                                                                                       |
| <a id="description"></a> `description`       | `string` \| `null`                                                                                             |
| <a id="entity_id"></a> `entity_id`           | [`SdkEntityId`](./api/SdkEntityId.md)                                                                          |
| <a id="id"></a> `id`                         | [`SdkDashboardId`](./api/SdkDashboardId.md)                                                                    |
| <a id="last-edit-info"></a> `last-edit-info` | \{ `email`: `string`; `first_name`: `string`; `id`: `number`; `last_name`: `string`; `timestamp`: `string`; \} |
| `last-edit-info.email`                       | `string`                                                                                                       |
| `last-edit-info.first_name`                  | `string`                                                                                                       |
| `last-edit-info.id`                          | `number`                                                                                                       |
| `last-edit-info.last_name`                   | `string`                                                                                                       |
| `last-edit-info.timestamp`                   | `string`                                                                                                       |
| <a id="name"></a> `name`                     | `string`                                                                                                       |
| <a id="updated_at"></a> `updated_at`         | `string`                                                                                                       |

<!-- [<endsnippet properties>] -->
