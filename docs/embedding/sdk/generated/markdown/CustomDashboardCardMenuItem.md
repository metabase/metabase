```ts
type CustomDashboardCardMenuItem = ({ question, }: {
  question: MetabaseQuestion;
 }) => DashCardMenuItem;
```

#### Parameters

| Parameter                 | Type                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| `{ question, }`           | { `question`: [`MetabaseQuestion`](./generated/html/MetabaseQuestion.md); } |
| `{ question, }.question`? | [`MetabaseQuestion`](./generated/html/MetabaseQuestion.md)                  |

#### Returns

[`DashCardMenuItem`](./generated/html/internal/DashCardMenuItem.md)
