```ts
type SdkLegacyActionDefinition = {
  action: {
    id: SdkActionId;
  };
};
```

How a data app built against an older SDK names an action: the saved action
`action.id` names, by its entity ID or numeric id.

## Deprecated

<!-- [<snippet deprecated>] -->

A data app passes a `defineAction` definition with `entityId`.

<!-- [<endsnippet deprecated>] -->

## Properties

<!-- [<snippet properties>] -->

| Property                         | Type                                                                        |
| :------------------------------- | :-------------------------------------------------------------------------- |
| <a id="action"></a> ~~`action`~~ | \{ `id`: [`SdkActionId`](/docs/latest/embedding/sdk/api/SdkActionId.md); \} |
| `action.id`                      | [`SdkActionId`](/docs/latest/embedding/sdk/api/SdkActionId.md)              |

<!-- [<endsnippet properties>] -->
