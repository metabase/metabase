```ts
const DataAppLink: ({
  to,
  children,
  onClick,
  target,
  rel,
  className,
  ...rest
}: DataAppLinkProps) => JSX.Element;
```

Navigates inside a Data App without requiring a router context.
Embedded apps use a button because a standalone tab cannot obtain the host's
credentials. Internal apps use links to the app's regular Metabase page.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter                                                    | Type                                                                     |
| :----------------------------------------------------------- | :----------------------------------------------------------------------- |
| `{ to, children, onClick, target, rel, className, ...rest }` | [`DataAppLinkProps`](/docs/latest/embedding/sdk/api/DataAppLinkProps.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`JSX.Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L4239)

<!-- [<endsnippet returns>] -->
