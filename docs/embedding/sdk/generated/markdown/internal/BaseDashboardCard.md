```ts
type BaseDashboardCard = DashboardCardLayoutAttrs & {
  card: Card | VirtualCard;
  card_id: CardId | null;
  collection_authority_level: CollectionAuthorityLevel;
  created_at: string;
  dashboard_id: DashboardId;
  dashboard_tab_id: DashboardTabId | null;
  entity_id: BaseEntityId;
  id: DashCardId;
  justAdded: boolean;
  updated_at: string;
  visualization_settings: DashCardVisualizationSettings;
};
```

#### Type declaration

| Name                          | Type                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `card`                        | [`Card`](./generated/html/Card.md) \| [`VirtualCard`](./generated/html/VirtualCard.md) |
| `card_id`                     | [`CardId`](./generated/html/CardId.md) \| `null`                                       |
| `collection_authority_level?` | [`CollectionAuthorityLevel`](./generated/html/CollectionAuthorityLevel.md)             |
| `created_at`                  | `string`                                                                               |
| `dashboard_id`                | [`DashboardId`](./generated/html/DashboardId.md)                                       |
| `dashboard_tab_id`            | [`DashboardTabId`](./generated/html/DashboardTabId.md) \| `null`                       |
| `entity_id`                   | [`BaseEntityId`](./generated/html/BaseEntityId.md)                                     |
| `id`                          | [`DashCardId`](./generated/html/DashCardId.md)                                         |
| `justAdded?`                  | `boolean`                                                                              |
| `updated_at`                  | `string`                                                                               |
| `visualization_settings?`     | [`DashCardVisualizationSettings`](./generated/html/DashCardVisualizationSettings.md)   |
