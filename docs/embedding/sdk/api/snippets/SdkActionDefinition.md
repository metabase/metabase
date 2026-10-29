```ts
type SdkActionDefinition = {
  action: {
    id: SdkActionId;
  };
};
```

How a data app names an action: a `defineAction` definition from the app's
typed schema, whose `action.id` is the entity ID of an action in the app's
collection.

## Properties

<!-- [<snippet properties>] -->

| Property                     | Type                                                                        |
| :--------------------------- | :-------------------------------------------------------------------------- |
| <a id="action"></a> `action` | \{ `id`: [`SdkActionId`](/docs/latest/embedding/sdk/api/SdkActionId.md); \} |
| `action.id`                  | [`SdkActionId`](/docs/latest/embedding/sdk/api/SdkActionId.md)              |

<!-- [<endsnippet properties>] -->
