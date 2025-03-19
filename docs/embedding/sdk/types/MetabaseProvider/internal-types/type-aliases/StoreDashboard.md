```ts
type StoreDashboard = Omit<Dashboard, "dashcards" | "tabs"> & {
  dashcards: DashCardId[];
  isDirty: boolean;
  tabs: StoreDashboardTab[];
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `dashcards` | [`DashCardId`](DashCardId.md)[] |
| `isDirty`? | `boolean` |
| `tabs`? | [`StoreDashboardTab`](StoreDashboardTab.md)[] |
