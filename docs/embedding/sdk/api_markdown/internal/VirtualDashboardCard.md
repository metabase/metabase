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

| Name                     | Type                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card`                   | [`VirtualCard`](./api_html/VirtualCard.md)                                                                                                                                                                          |
| `card_id`                | `null`                                                                                                                                                                                                              |
| `parameter_mappings?`    | \| [`VirtualDashCardParameterMapping`](./api_html/VirtualDashCardParameterMapping.md)\[] \| `null`                                                                                                                  |
| `visualization_settings` | [`BaseDashboardCard`](./api_html/BaseDashboardCard.md)\[`"visualization_settings"`] & { `link`: [`LinkCardSettings`](./api_html/LinkCardSettings.md); `virtual_card`: [`VirtualCard`](./api_html/VirtualCard.md); } |
