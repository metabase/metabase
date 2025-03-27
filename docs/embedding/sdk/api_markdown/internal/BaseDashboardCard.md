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

| Name                          | Type                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `card`                        | [`Card`](./api_html/Card.md) \| [`VirtualCard`](./api_html/VirtualCard.md)     |
| `card_id`                     | [`CardId`](./api_html/CardId.md) \| `null`                                     |
| `collection_authority_level?` | [`CollectionAuthorityLevel`](./api_html/CollectionAuthorityLevel.md)           |
| `created_at`                  | `string`                                                                       |
| `dashboard_id`                | [`DashboardId`](./api_html/DashboardId.md)                                     |
| `dashboard_tab_id`            | [`DashboardTabId`](./api_html/DashboardTabId.md) \| `null`                     |
| `entity_id`                   | [`BaseEntityId`](./api_html/BaseEntityId.md)                                   |
| `id`                          | [`DashCardId`](./api_html/DashCardId.md)                                       |
| `justAdded?`                  | `boolean`                                                                      |
| `updated_at`                  | `string`                                                                       |
| `visualization_settings?`     | [`DashCardVisualizationSettings`](./api_html/DashCardVisualizationSettings.md) |
