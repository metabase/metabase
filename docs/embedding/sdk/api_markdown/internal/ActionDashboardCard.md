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

## Type declaration

| Name | Type |
| ------ | ------ |
| `action?` | [`WritebackAction`](WritebackAction.md) |
| `action_id` | [`WritebackActionId`](WritebackActionId.md) |
| `card` | [`Card`](Card.md) |
| `card_id` | [`CardId`](CardId.md) \| `null` |
| `parameter_mappings?` | [`ActionParametersMapping`](ActionParametersMapping.md)[] \| `null` |
| `visualization_settings` | [`DashCardVisualizationSettings`](DashCardVisualizationSettings.md) & \{ `actionDisplayType`: [`ActionDisplayType`](ActionDisplayType.md); `button.label`: `string`; `click_behavior`: [`ClickBehavior`](ClickBehavior.md); `virtual_card`: [`VirtualCard`](VirtualCard.md); \} |
