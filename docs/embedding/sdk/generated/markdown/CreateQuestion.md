```ts
function CreateQuestion(
  props?: Partial<
    Omit<BaseInteractiveQuestionProps, "questionId" | "children">
  >,
): Element;
```

## Parameters

| Parameter | Type                                                                                  |
| --------- | ------------------------------------------------------------------------------------- |
| `props`?  | `Partial`\<`Omit`\<`BaseInteractiveQuestionProps`, `"questionId"` \| `"children"`\>\> |

## Returns

`Element`

## Deprecated

Use `<InteractiveQuestion questionId="new" />` instead.
