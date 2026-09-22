```ts
type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;
```

## Parameters

<!-- [<snippet parameters>] -->

| Parameter                 | Type                                                                |
| :------------------------ | :------------------------------------------------------------------ |
| `{ question, }`           | \{ `question?`: [`MetabaseQuestion`](./api/MetabaseQuestion.md); \} |
| `{ question, }.question?` | [`MetabaseQuestion`](./api/MetabaseQuestion.md)                     |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`DashCardMenuItem`](./api/DashCardMenuItem.md)

<!-- [<endsnippet returns>] -->
