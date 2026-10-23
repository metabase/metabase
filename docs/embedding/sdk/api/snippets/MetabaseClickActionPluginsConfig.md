```ts
type MetabaseClickActionPluginsConfig = (
  clickActions: MetabaseClickAction[],
  clickedDataPoint: MetabaseDataPointObject,
) =>
  | MetabaseClickAction[]
  | {
      onClick: () => void;
    };
```

## Parameters

<!-- [<snippet parameters>] -->

| Parameter          | Type                                                              |
| :----------------- | :---------------------------------------------------------------- |
| `clickActions`     | [`MetabaseClickAction`](./sdk/api/MetabaseClickAction.md)[]       |
| `clickedDataPoint` | [`MetabaseDataPointObject`](./sdk/api/MetabaseDataPointObject.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

\| [`MetabaseClickAction`](./sdk/api/MetabaseClickAction.md)[]
\| \{
`onClick`: () => `void`;
\}

<!-- [<endsnippet returns>] -->
