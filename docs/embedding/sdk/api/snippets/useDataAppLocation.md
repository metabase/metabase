```ts
const useDataAppLocation: () => UseDataAppLocationResult;
```

The current data-app sub-path and a `navigate` function.

Paths are relative to the data-app root: `/`, `/customers/42`, etc.
`navigate(to)` switches sub-path without a full reload.

## Returns

<!-- [<snippet returns>] -->

[`UseDataAppLocationResult`](./api/UseDataAppLocationResult.md)

<!-- [<endsnippet returns>] -->
