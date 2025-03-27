```ts
type CustomDashboardCardMenuItem = ({ question, }: {
  question: MetabaseQuestion;
 }) => DashCardMenuItem;
```

#### Parameters

| Parameter                 | Type                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `{ question, }`           | { `question`: [`MetabaseQuestion`](./api_html/MetabaseQuestion.md); } |
| `{ question, }.question`? | [`MetabaseQuestion`](./api_html/MetabaseQuestion.md)                  |

#### Returns

[`DashCardMenuItem`](./api_html/internal/DashCardMenuItem.md)
