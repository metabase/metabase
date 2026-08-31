```ts
function useAction<TParameters, TKind>(
  actionId: SdkActionId | null,
): UseActionResult<TParameters, TKind>;
```

Triggers a pre-existing Metabase action. The first arg is the action's
numeric id or its `entity_id` string; supply `TParameters` as the first
generic to type the `execute` argument, and optionally `TKind` as the
second generic to type the discriminated `result` shape.

Without `TKind`, `result` defaults to a union of every possible response
body (`AnyActionResult`) — authors who don't know the kind upfront can
narrow with `"<key>" in result` instead of casting from
`Record<string, unknown>`.

useAction<{ name: string; email: string }, "create">(42);

Unlike the query hooks, this does NOT run on mount — the caller invokes
`execute` explicitly from an event handler. To gate execution
conditionally, branch in the event handler (e.g.
`if (!user.canEdit) return;`) before calling `execute`.

## Type Parameters

<!-- [<snippet type-parameters>] -->

| Type Parameter                                                                                                                             |
| :----------------------------------------------------------------------------------------------------------------------------------------- |
| `TParameters` _extends_ [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `unknown`\> |
| `TKind` _extends_ [`ActionKind`](./api/ActionKind.md) \| `undefined`                                                                       |

<!-- [<endsnippet type-parameters>] -->

## Parameters

<!-- [<snippet parameters>] -->

| Parameter  | Type                                            |
| :--------- | :---------------------------------------------- |
| `actionId` | [`SdkActionId`](./api/SdkActionId.md) \| `null` |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

<!-- [<endsnippet returns>] -->
