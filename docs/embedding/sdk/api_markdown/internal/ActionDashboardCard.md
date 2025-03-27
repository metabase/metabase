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

| Name                     | Type                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action?`                | [`WritebackAction`](./api_html/WritebackAction.md)                                                                                                                                                                                                                                                                        |
| `action_id`              | [`WritebackActionId`](./api_html/WritebackActionId.md)                                                                                                                                                                                                                                                                    |
| `card`                   | [`Card`](./api_html/Card.md)                                                                                                                                                                                                                                                                                              |
| `card_id`                | [`CardId`](./api_html/CardId.md) \| `null`                                                                                                                                                                                                                                                                                |
| `parameter_mappings?`    | [`ActionParametersMapping`](./api_html/ActionParametersMapping.md)\[] \| `null`                                                                                                                                                                                                                                           |
| `visualization_settings` | [`DashCardVisualizationSettings`](./api_html/DashCardVisualizationSettings.md) & { `actionDisplayType`: [`ActionDisplayType`](./api_html/ActionDisplayType.md); `button.label`: `string`; `click_behavior`: [`ClickBehavior`](./api_html/ClickBehavior.md); `virtual_card`: [`VirtualCard`](./api_html/VirtualCard.md); } |
