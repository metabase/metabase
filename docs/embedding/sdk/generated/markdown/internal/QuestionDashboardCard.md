```ts
type QuestionDashboardCard = BaseDashboardCard & {
  card: Card;
  card_id: CardId | null;
  parameter_mappings: DashboardParameterMapping[] | null;
  series: Card[];
};
```

#### Type declaration

| Name                  | Type                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `card`                | [`Card`](./generated/html/Card.md)                                                        |
| `card_id`             | [`CardId`](./generated/html/CardId.md) \| `null`                                          |
| `parameter_mappings?` | [`DashboardParameterMapping`](./generated/html/DashboardParameterMapping.md)\[] \| `null` |
| `series?`             | [`Card`](./generated/html/Card.md)\[]                                                     |
