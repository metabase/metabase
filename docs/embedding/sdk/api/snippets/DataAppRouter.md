```ts
const DataAppRouter: ({ children }: DataAppRouterProps) => JSX_3.Element;
```

Wrap your data-app tree once. Inside, use `<DataAppLink to="…">` for
navigation and `useDataAppLocation()` to read the current path.

No `basename` prop: it is auto-detected from the iframe URL
(`/embed/apps/<name>`). In the dev preview, where there is no prefix, the
basename resolves to `""` and the sub-path is just the raw pathname.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter      | Type                                                |
| :------------- | :-------------------------------------------------- |
| `{ children }` | [`DataAppRouterProps`](./api/DataAppRouterProps.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`JSX_3.Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

<!-- [<endsnippet returns>] -->
