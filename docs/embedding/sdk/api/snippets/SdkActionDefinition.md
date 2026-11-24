```ts
type SdkActionDefinition = {
  entityId: SdkEntityId;
  kind: "row/create" | "row/update" | "row/delete";
  table: {
    id: number;
  };
};
```

How a data app names an action: a `defineAction` definition of an implicit
action on a table. The dev preview runs it without saving it, and a
production build runs the action `entityId` names.

## Properties

<!-- [<snippet properties>] -->

| Property                                             | Type                                                           |
| :--------------------------------------------------- | :------------------------------------------------------------- |
| <a id="sdkactiondefinition-entityid"></a> `entityId` | [`SdkEntityId`](/docs/latest/embedding/sdk/api/SdkEntityId.md) |
| <a id="sdkactiondefinition-kind"></a> `kind`         | `"row/create"` \| `"row/update"` \| `"row/delete"`             |
| <a id="sdkactiondefinition-table"></a> `table`       | \{ `id`: `number`; \}                                          |
| `table.id`                                           | `number`                                                       |

<!-- [<endsnippet properties>] -->
