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

## Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`Card`](Card.md) \| [`VirtualCard`](VirtualCard.md) |
| `card_id` | [`CardId`](CardId.md) \| `null` |
| `collection_authority_level?` | [`CollectionAuthorityLevel`](CollectionAuthorityLevel.md) |
| `created_at` | `string` |
| `dashboard_id` | [`DashboardId`](DashboardId.md) |
| `dashboard_tab_id` | [`DashboardTabId`](DashboardTabId.md) \| `null` |
| `entity_id` | [`BaseEntityId`](BaseEntityId.md) |
| `id` | [`DashCardId`](DashCardId.md) |
| `justAdded?` | `boolean` |
| `updated_at` | `string` |
| `visualization_settings?` | [`DashCardVisualizationSettings`](DashCardVisualizationSettings.md) |
