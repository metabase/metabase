```ts
type SdkActionDefinition = {
  action: {
    id: SdkActionId;
  };
  copiedActionId?: number;
};
```

How a data app names an action: the `defineAction` export, which is what a
data app must pass. `copiedActionId` addresses the copy synchronization made
in the app's own collection — the only one its viewers can read. The dev
preview runs `action` instead, so an app works before its first
synchronization.

## Properties

<!-- [<snippet properties>] -->

| Property                                      | Type                                               |
| :-------------------------------------------- | :------------------------------------------------- |
| <a id="action"></a> `action`                  | \{ `id`: [`SdkActionId`](./api/SdkActionId.md); \} |
| `action.id`                                   | [`SdkActionId`](./api/SdkActionId.md)              |
| <a id="copiedactionid"></a> `copiedActionId?` | `number`                                           |

<!-- [<endsnippet properties>] -->
