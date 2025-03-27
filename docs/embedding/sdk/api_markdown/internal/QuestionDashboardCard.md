```ts
type QuestionDashboardCard = BaseDashboardCard & {
  card: Card;
  card_id: CardId | null;
  parameter_mappings: DashboardParameterMapping[] | null;
  series: Card[];
};
```

#### Type declaration

| Name                  | Type                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `card`                | [`Card`](./api_html/Card.md)                                                        |
| `card_id`             | [`CardId`](./api_html/CardId.md) \| `null`                                          |
| `parameter_mappings?` | [`DashboardParameterMapping`](./api_html/DashboardParameterMapping.md)\[] \| `null` |
| `series?`             | [`Card`](./api_html/Card.md)\[]                                                     |
