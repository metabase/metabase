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

| Property                                                       | Type                                                                                                           |
| :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| <a id="metabasedashboard-collection"></a> `collection?`        | [`MetabaseCollection`](/docs/latest/embedding/sdk/api/MetabaseCollection.md) \| `null`                         |
| <a id="metabasedashboard-created_at"></a> `created_at`         | `string`                                                                                                       |
| <a id="metabasedashboard-description"></a> `description`       | `string` \| `null`                                                                                             |
| <a id="metabasedashboard-entity_id"></a> `entity_id`           | [`SdkEntityId`](/docs/latest/embedding/sdk/api/SdkEntityId.md)                                                 |
| <a id="metabasedashboard-id"></a> `id`                         | [`SdkDashboardId`](/docs/latest/embedding/sdk/api/SdkDashboardId.md)                                           |
| <a id="metabasedashboard-last-edit-info"></a> `last-edit-info` | \{ `email`: `string`; `first_name`: `string`; `id`: `number`; `last_name`: `string`; `timestamp`: `string`; \} |
| `last-edit-info.email`                                         | `string`                                                                                                       |
| `last-edit-info.first_name`                                    | `string`                                                                                                       |
| `last-edit-info.id`                                            | `number`                                                                                                       |
| `last-edit-info.last_name`                                     | `string`                                                                                                       |
| `last-edit-info.timestamp`                                     | `string`                                                                                                       |
| <a id="metabasedashboard-name"></a> `name`                     | `string`                                                                                                       |
| <a id="metabasedashboard-updated_at"></a> `updated_at`         | `string`                                                                                                       |

<!-- [<endsnippet properties>] -->
