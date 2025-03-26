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

## Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`VirtualCard`](VirtualCard.md) |
| `card_id` | `null` |
| `parameter_mappings?` | \| [`VirtualDashCardParameterMapping`](VirtualDashCardParameterMapping.md)[] \| `null` |
| `visualization_settings` | [`BaseDashboardCard`](BaseDashboardCard.md)\[`"visualization_settings"`\] & \{ `link`: [`LinkCardSettings`](LinkCardSettings.md); `virtual_card`: [`VirtualCard`](VirtualCard.md); \} |
