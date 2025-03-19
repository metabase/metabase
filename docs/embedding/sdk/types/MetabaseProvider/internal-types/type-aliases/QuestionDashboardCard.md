```ts
type QuestionDashboardCard = BaseDashboardCard & {
  card: Card;
  card_id: CardId | null;
  parameter_mappings: DashboardParameterMapping[] | null;
  series: Card[];
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `card` | [`Card`](../interfaces/Card.md) |
| `card_id` | [`CardId`](CardId.md) \| `null` |
| `parameter_mappings`? | [`DashboardParameterMapping`](DashboardParameterMapping.md)[] \| `null` |
| `series`? | [`Card`](../interfaces/Card.md)[] |
