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

| Property                                 | Type                                                                                                                                                                       | Description                                         |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| <a id="chart"></a> `Chart`               | [`React_2.ComponentType`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L124)\<[`MetabotChartProps`](./api/MetabotChartProps.md)\> | A pre-wired React component that renders the chart. |
| <a id="id"></a> `id`                     | `string`                                                                                                                                                                   | -                                                   |
| <a id="questionpath"></a> `questionPath` | `string`                                                                                                                                                                   | URL path to the question, e.g. `/question#<base64>` |
| <a id="role"></a> `role`                 | `"agent"`                                                                                                                                                                  | -                                                   |
| <a id="type"></a> `type`                 | `"chart"`                                                                                                                                                                  | -                                                   |

<!-- [<endsnippet properties>] -->
