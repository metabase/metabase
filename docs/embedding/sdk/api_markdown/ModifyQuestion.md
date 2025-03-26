```ts
const ModifyQuestion: ({
  questionId,
  plugins,
  onSave,
  onBeforeSave,
  entityTypeFilter,
  isSaveEnabled,
  targetCollection,
}: InteractiveQuestionProps) => JSX_2.Element;
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `{ questionId, plugins, onSave, onBeforeSave, entityTypeFilter, isSaveEnabled, targetCollection, }` | [`InteractiveQuestionProps`](InteractiveQuestionProps.md) |

## Returns

`JSX_2.Element`

## Deprecated

Use `InteractiveQuestion` with `isSaveEnabled={true}` instead.
