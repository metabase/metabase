```ts
type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;
```

## Parameters

<!-- [<snippet parameters>] -->

| Parameter                 | Type                                                                    |
| :------------------------ | :---------------------------------------------------------------------- |
| `{ question, }`           | \{ `question?`: [`MetabaseQuestion`](./sdk/api/MetabaseQuestion.md); \} |
| `{ question, }.question?` | [`MetabaseQuestion`](./sdk/api/MetabaseQuestion.md)                     |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`DashCardMenuItem`](./sdk/api/DashCardMenuItem.md)

<!-- [<endsnippet returns>] -->
