```ts
type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;
```

## Parameters

<!-- [<snippet parameters>] -->

| Parameter                 | Type                                                                                         |
| :------------------------ | :------------------------------------------------------------------------------------------- |
| `{ question, }`           | \{ `question?`: [`MetabaseQuestion`](/docs/latest/embedding/sdk/api/MetabaseQuestion.md); \} |
| `{ question, }.question?` | [`MetabaseQuestion`](/docs/latest/embedding/sdk/api/MetabaseQuestion.md)                     |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`DashCardMenuItem`](/docs/latest/embedding/sdk/api/DashCardMenuItem.md)

<!-- [<endsnippet returns>] -->
