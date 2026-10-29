```ts
const DataAppLink: ({
  to,
  children,
  onClick,
  target,
  rel,
  ...rest
}: DataAppLinkProps) => JSX_3.Element;
```

Internal-only navigation link inside a data app.

Renders a plain anchor rather than a router `<Link>`: a data app is mounted
outside the app's route tree, so it has no router context to read.

The `href` is the app's page in Metabase, so opening the link in a new tab or
copying its address lands on the app rather than on its iframe, which refuses
to load as a top-level page. A plain click navigates inside the app.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter                                         | Type                                            |
| :------------------------------------------------ | :---------------------------------------------- |
| `{ to, children, onClick, target, rel, ...rest }` | [`DataAppLinkProps`](./api/DataAppLinkProps.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`JSX_3.Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/jsx-runtime.d.ts#L6)

<!-- [<endsnippet returns>] -->
