```ts
type StoreDashboard = Omit<MetabaseDashboard, "dashcards" | "tabs"> & {
  dashcards: DashCardId[];
  isDirty: boolean;
  tabs: StoreDashboardTab[];
};
```

#### Type declaration

| Name        | Type                                                            |
| ----------- | --------------------------------------------------------------- |
| `dashcards` | [`DashCardId`](./generated/html/DashCardId.md)\[]               |
| `isDirty?`  | `boolean`                                                       |
| `tabs?`     | [`StoreDashboardTab`](./generated/html/StoreDashboardTab.md)\[] |
