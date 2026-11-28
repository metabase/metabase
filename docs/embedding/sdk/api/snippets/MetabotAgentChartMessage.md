```ts
type MetabotAgentChartMessage = {
  Chart: React_2.ComponentType<MetabotChartProps>;
  id: string;
  questionPath: string;
  role: "agent";
  type: "chart";
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                                          | Type                                                                                                                                                                                                | Description                                         |
| :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| <a id="metabotagentchartmessage-chart"></a> `Chart`               | [`React_2.ComponentType`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L124)\<[`MetabotChartProps`](/docs/latest/embedding/sdk/api/MetabotChartProps.md)\> | A pre-wired React component that renders the chart. |
| <a id="metabotagentchartmessage-id"></a> `id`                     | `string`                                                                                                                                                                                            | -                                                   |
| <a id="metabotagentchartmessage-questionpath"></a> `questionPath` | `string`                                                                                                                                                                                            | URL path to the question, e.g. `/question#<base64>` |
| <a id="metabotagentchartmessage-role"></a> `role`                 | `"agent"`                                                                                                                                                                                           | -                                                   |
| <a id="metabotagentchartmessage-type"></a> `type`                 | `"chart"`                                                                                                                                                                                           | -                                                   |

<!-- [<endsnippet properties>] -->
