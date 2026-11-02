```ts
function InteractiveDashboard(
  props: {
    autoRefreshInterval?: number;
    dashboardId: SdkDashboardId;
    drillThroughQuestionHeight?: Height<string | number>;
    drillThroughQuestionProps?: DrillThroughQuestionProps;
    initialParameters?: ParameterValues;
    navigatedEntityParameters?: NavigatedEntityParameters;
    onNavigatedEntityParametersChange?: (
      payload: NavigatedEntityParameterChangePayload,
    ) => void;
    onParametersChange?: (payload: ParameterChangePayload) => void;
    parameters?: ParameterValues;
    plugins?: MetabasePluginsConfig;
    renderDrillThroughQuestion?: () => ReactNode;
  } & {
    dashboardId?: SdkDashboardId | null;
    token?: string | null;
  } & {
    enableEntityNavigation?: boolean;
    hiddenParameters?: string[];
    initialParameters?: ParameterValues;
    withCardTitle?: boolean;
    withDownloads?: boolean;
    withSubscriptions?: boolean;
    withTitle?: boolean;
  } & {
    className?: string;
    style?: CSSProperties;
  } & {
    onLoad?: (dashboard: MetabaseDashboard | null) => void;
    onLoadWithoutCards?: (dashboard: MetabaseDashboard | null) => void;
    onVisualizationChange?: (
      visualization:
        | "object"
        | "table"
        | "bar"
        | "line"
        | "pie"
        | "scalar"
        | "row"
        | "area"
        | "combo"
        | "pivot"
        | "smartscalar"
        | "gauge"
        | "progress"
        | "funnel"
        | "map"
        | "scatter"
        | "boxplot"
        | "waterfall"
        | "sankey"
        | "treemap"
        | "list",
    ) => void;
  } & {},
): Element;
```

A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Description |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------- |
| `props`   | \{ `autoRefreshInterval?`: `number`; `dashboardId`: [`SdkDashboardId`](/docs/latest/embedding/sdk/api/SdkDashboardId.md); `drillThroughQuestionHeight?`: `Height`\<`string` \| `number`\>; `drillThroughQuestionProps?`: [`DrillThroughQuestionProps`](/docs/latest/embedding/sdk/api/DrillThroughQuestionProps.md); `initialParameters?`: [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md); `navigatedEntityParameters?`: [`NavigatedEntityParameters`](/docs/latest/embedding/sdk/api/NavigatedEntityParameters.md); `onNavigatedEntityParametersChange?`: (`payload`: [`NavigatedEntityParameterChangePayload`](/docs/latest/embedding/sdk/api/NavigatedEntityParameterChangePayload.md)) => `void`; `onParametersChange?`: (`payload`: [`ParameterChangePayload`](/docs/latest/embedding/sdk/api/ParameterChangePayload.md)) => `void`; `parameters?`: [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md); `plugins?`: [`MetabasePluginsConfig`](/docs/latest/embedding/sdk/api/MetabasePluginsConfig.md); `renderDrillThroughQuestion?`: () => [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L436); \} & \{ `dashboardId?`: [`SdkDashboardId`](/docs/latest/embedding/sdk/api/SdkDashboardId.md) \| `null`; `token?`: `string` \| `null`; \} & \{ `enableEntityNavigation?`: `boolean`; `hiddenParameters?`: `string`[]; `initialParameters?`: [`ParameterValues`](/docs/latest/embedding/sdk/api/ParameterValues.md); `withCardTitle?`: `boolean`; `withDownloads?`: `boolean`; `withSubscriptions?`: `boolean`; `withTitle?`: `boolean`; \} & \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L2571); \} & \{ `onLoad?`: (`dashboard`: [`MetabaseDashboard`](/docs/latest/embedding/sdk/api/MetabaseDashboard.md) \| `null`) => `void`; `onLoadWithoutCards?`: (`dashboard`: [`MetabaseDashboard`](/docs/latest/embedding/sdk/api/MetabaseDashboard.md) \| `null`) => `void`; `onVisualizationChange?`: (`visualization`: \| `"object"` \| `"table"` \| `"bar"` \| `"line"` \| `"pie"` \| `"scalar"` \| `"row"` \| `"area"` \| `"combo"` \| `"pivot"` \| `"smartscalar"` \| `"gauge"` \| `"progress"` \| `"funnel"` \| `"map"` \| `"scatter"` \| `"boxplot"` \| `"waterfall"` \| `"sankey"` \| `"treemap"` \| `"list"`) => `void`; \} & \{ \} |             |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts#L4239)

<!-- [<endsnippet returns>] -->
