```ts
type CustomDashboardCardMenuItem = ({ question, }: {
  question: MetabaseQuestion;
 }) => DashCardMenuItem;
```

#### Parameters

| Parameter                 | Type                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `{ question, }`           | { `question`: [`MetabaseQuestion`](MetabaseQuestion.md); } |
| `{ question, }.question`? | [`MetabaseQuestion`](MetabaseQuestion.md)                  |

#### Returns

[`DashCardMenuItem`](internal/DashCardMenuItem.md)
