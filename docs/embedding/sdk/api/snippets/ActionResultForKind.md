```ts
type ActionResultForKind<TKind> = TKind extends "create"
  ? ActionResultForCreate
  : TKind extends "update"
    ? ActionResultForUpdate
    : TKind extends "delete"
      ? ActionResultForDelete
      : TKind extends "bulk"
        ? ActionResultForBulk
        : TKind extends "sql"
          ? ActionResultForSql
          : AnyActionResult;
```

Maps an `ActionKind` literal to the discriminated `result` shape. Omit
`TKind` (`undefined`) to fall back to the `AnyActionResult` union.

## Type Parameters

<!-- [<snippet type-parameters>] -->

| Type Parameter                                                       |
| :------------------------------------------------------------------- |
| `TKind` _extends_ [`ActionKind`](./api/ActionKind.md) \| `undefined` |

<!-- [<endsnippet type-parameters>] -->
