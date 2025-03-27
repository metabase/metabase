```ts
type StoreDashboard = Omit<MetabaseDashboard, "dashcards" | "tabs"> & {
  dashcards: DashCardId[];
  isDirty: boolean;
  tabs: StoreDashboardTab[];
};
```

#### Type declaration

| Name        | Type                                                      |
| ----------- | --------------------------------------------------------- |
| `dashcards` | [`DashCardId`](./api_html/DashCardId.md)\[]               |
| `isDirty?`  | `boolean`                                                 |
| `tabs?`     | [`StoreDashboardTab`](./api_html/StoreDashboardTab.md)\[] |
