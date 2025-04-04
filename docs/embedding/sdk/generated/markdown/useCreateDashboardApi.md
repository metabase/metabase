```ts
function useCreateDashboardApi(): {
  createDashboard: (
    options: CreateDashboardValues,
  ) => Promise<MetabaseDashboard>;
};
```

Creates a dashboard

## Returns

```ts
{
  createDashboard: (options: CreateDashboardValues) =>
    Promise<MetabaseDashboard>;
}
```

| Name              | Type                                                                                                                         | Description |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `createDashboard` | (`options`: [`CreateDashboardValues`](CreateDashboardValues.md)) => `Promise`\<[`MetabaseDashboard`](MetabaseDashboard.md)\> |             |
