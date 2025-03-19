```ts
type DashboardTab = {
  created_at: string;
  dashboard_id: DashboardId;
  entity_id: BaseEntityId;
  id: DashboardTabId;
  name: string;
  position: number;
  updated_at: string;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="created_at"></a> `created_at`? | `string` |
| <a id="dashboard_id"></a> `dashboard_id` | [`DashboardId`](DashboardId.md) |
| <a id="entity_id"></a> `entity_id`? | [`BaseEntityId`](BaseEntityId.md) |
| <a id="id"></a> `id` | [`DashboardTabId`](DashboardTabId.md) |
| <a id="name"></a> `name` | `string` |
| <a id="position"></a> `position`? | `number` |
| <a id="updated_at"></a> `updated_at`? | `string` |
