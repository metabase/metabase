```ts
type SdkActionDefinition = {
  action: {
    id: SdkActionId;
  };
  copiedActionEntityId?: SdkEntityId;
};
```

How a data app names an action: the `defineAction` export, which is what a
data app must pass. `copiedActionEntityId` addresses the copy in the app's own
collection, the only one its viewers can read. The dev preview runs `action`
instead, so an app works before its resources are written.

## Properties

<!-- [<snippet properties>] -->

| Property                                                  | Type                                               |
| :-------------------------------------------------------- | :------------------------------------------------- |
| <a id="action"></a> `action`                              | \{ `id`: [`SdkActionId`](./api/SdkActionId.md); \} |
| `action.id`                                               | [`SdkActionId`](./api/SdkActionId.md)              |
| <a id="copiedactionentityid"></a> `copiedActionEntityId?` | [`SdkEntityId`](./api/SdkEntityId.md)              |

<!-- [<endsnippet properties>] -->
