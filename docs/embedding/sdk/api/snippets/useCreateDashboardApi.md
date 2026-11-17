```ts
function useCreateDashboardApi(): {
  createDashboard: (
    params: CreateDashboardValues,
  ) => Promise<MetabaseDashboard>;
} | null;
```

Creates a dashboard.
Returns `null` until the SDK is fully loaded and initialized.

## Returns

<!-- [<snippet returns>] -->

\| \{
`createDashboard`: (`params`: [`CreateDashboardValues`](/docs/latest/embedding/sdk/api/CreateDashboardValues.md)) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<[`MetabaseDashboard`](/docs/latest/embedding/sdk/api/MetabaseDashboard.md)\>;
\}
\| `null`

<!-- [<endsnippet returns>] -->
