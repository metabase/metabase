```ts
function useCreateDashboardApi(): {
  createDashboard: (
    options: CreateDashboardValues,
  ) => Promise<MetabaseDashboard>;
};
```

Creates a dashboard

## Returns

<!-- [<snippet returns>] -->

```ts
{
  createDashboard: (options: CreateDashboardValues) =>
    Promise<MetabaseDashboard>;
}
```

| Name                | Type                                                                                                                                                                                                                           | Description |
| :------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| `createDashboard()` | (`options`: [`CreateDashboardValues`](./api/CreateDashboardValues.md)) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`MetabaseDashboard`](./api/MetabaseDashboard.md)\> |             |

<!-- [<endsnippet returns>] -->
