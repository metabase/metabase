```ts
type MetabaseClickActionPluginsConfig = (
  clickActions: ClickAction[],
  clickedDataPoint: MetabaseDataPointObject,
) => ClickAction[];
```

#### Parameters

| Parameter          | Type                                                    |
| ------------------ | ------------------------------------------------------- |
| `clickActions`     | [`ClickAction`](internal/ClickAction.md)\[]             |
| `clickedDataPoint` | [`MetabaseDataPointObject`](MetabaseDataPointObject.md) |

#### Returns

[`ClickAction`](internal/ClickAction.md)\[]
