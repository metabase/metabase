```ts
function useCreateDashboardApi(): null | {
  createDashboard: (
    params: CreateDashboardValues,
  ) => Promise<MetabaseDashboard>;
};
```

Creates a dashboard.
Returns `null` until the SDK is fully loaded and initialized.

## Returns

<!-- [<snippet returns>] -->

\| `null`
\| \{
`createDashboard`: (`params`: [`CreateDashboardValues`](./api/CreateDashboardValues.md)) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`MetabaseDashboard`](./api/MetabaseDashboard.md)\>;
\}

<!-- [<endsnippet returns>] -->
