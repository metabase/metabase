```ts
const DataAppRouter: ({ children }: DataAppRouterProps) => JSX.Element;
```

Wrap your data-app tree once. Inside, use `<DataAppLink to="…">` for
navigation and `useDataAppLocation()` to read the current path.

No `basename` prop: it is auto-detected from the iframe URL
(`/embed/apps/<name>`). In the dev preview, where there is no prefix, the
basename resolves to `""` and the sub-path is just the raw pathname.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter      | Type                                                                         |
| :------------- | :--------------------------------------------------------------------------- |
| `{ children }` | [`DataAppRouterProps`](/docs/latest/embedding/sdk/api/DataAppRouterProps.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`JSX.Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L4239)

<!-- [<endsnippet returns>] -->
