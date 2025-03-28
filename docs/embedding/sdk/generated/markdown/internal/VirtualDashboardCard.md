```ts
type VirtualDashboardCard = BaseDashboardCard & {
  card: VirtualCard;
  card_id: null;
  parameter_mappings:   | VirtualDashCardParameterMapping[]
     | null;
  visualization_settings: BaseDashboardCard["visualization_settings"] & {
     link: LinkCardSettings;
     virtual_card: VirtualCard;
    };
};
```

#### Type declaration

| Name                     | Type                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card`                   | [`VirtualCard`](./generated/html/VirtualCard.md)                                                                                                                                                                                      |
| `card_id`                | `null`                                                                                                                                                                                                                                |
| `parameter_mappings?`    | \| [`VirtualDashCardParameterMapping`](./generated/html/VirtualDashCardParameterMapping.md)\[] \| `null`                                                                                                                              |
| `visualization_settings` | [`BaseDashboardCard`](./generated/html/BaseDashboardCard.md)\[`"visualization_settings"`] & { `link`: [`LinkCardSettings`](./generated/html/LinkCardSettings.md); `virtual_card`: [`VirtualCard`](./generated/html/VirtualCard.md); } |
