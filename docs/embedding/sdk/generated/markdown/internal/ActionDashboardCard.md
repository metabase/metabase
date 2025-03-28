```ts
type ActionDashboardCard = Omit<BaseDashboardCard, "parameter_mappings"> & {
  action: WritebackAction;
  action_id: WritebackActionId;
  card: Card;
  card_id: CardId | null;
  parameter_mappings: ActionParametersMapping[] | null;
  visualization_settings: DashCardVisualizationSettings & {
     actionDisplayType: ActionDisplayType;
     button.label: string;
     click_behavior: ClickBehavior;
     virtual_card: VirtualCard;
    };
};
```

#### Type declaration

| Name                     | Type                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action?`                | [`WritebackAction`](./generated/html/WritebackAction.md)                                                                                                                                                                                                                                                                                          |
| `action_id`              | [`WritebackActionId`](./generated/html/WritebackActionId.md)                                                                                                                                                                                                                                                                                      |
| `card`                   | [`Card`](./generated/html/Card.md)                                                                                                                                                                                                                                                                                                                |
| `card_id`                | [`CardId`](./generated/html/CardId.md) \| `null`                                                                                                                                                                                                                                                                                                  |
| `parameter_mappings?`    | [`ActionParametersMapping`](./generated/html/ActionParametersMapping.md)\[] \| `null`                                                                                                                                                                                                                                                             |
| `visualization_settings` | [`DashCardVisualizationSettings`](./generated/html/DashCardVisualizationSettings.md) & { `actionDisplayType`: [`ActionDisplayType`](./generated/html/ActionDisplayType.md); `button.label`: `string`; `click_behavior`: [`ClickBehavior`](./generated/html/ClickBehavior.md); `virtual_card`: [`VirtualCard`](./generated/html/VirtualCard.md); } |
