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

| Parameter          | Type                                                          |
| :----------------- | :------------------------------------------------------------ |
| `clickActions`     | [`MetabaseClickAction`](./api/MetabaseClickAction.md)[]       |
| `clickedDataPoint` | [`MetabaseDataPointObject`](./api/MetabaseDataPointObject.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

\| [`MetabaseClickAction`](./api/MetabaseClickAction.md)[]
\| \{
`onClick`: () => `void`;
\}

<!-- [<endsnippet returns>] -->
