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

| Parameter          | Type                                                                                   |
| :----------------- | :------------------------------------------------------------------------------------- |
| `clickActions`     | [`MetabaseClickAction`](/docs/latest/embedding/sdk/api/MetabaseClickAction.md)[]       |
| `clickedDataPoint` | [`MetabaseDataPointObject`](/docs/latest/embedding/sdk/api/MetabaseDataPointObject.md) |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

\| [`MetabaseClickAction`](/docs/latest/embedding/sdk/api/MetabaseClickAction.md)[]
\| \{
`onClick`: () => `void`;
\}

<!-- [<endsnippet returns>] -->
