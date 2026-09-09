```ts
function InteractiveDashboard(
  props: {
    autoRefreshInterval?: number;
    dashboardId: SdkDashboardId;
    drillThroughQuestionHeight?: Height<string | number>;
    drillThroughQuestionProps?: DrillThroughQuestionProps;
    initialParameters?: ParameterValues;
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
  } & {
    dataPickerProps?: Pick<SdkQuestionProps, "entityTypes">;
  } & {},
): Element;
```

A dashboard component with drill downs, click behaviors, and the ability to view and click into questions.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Description |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| `props`   | \{ `autoRefreshInterval?`: `number`; `dashboardId`: [`SdkDashboardId`](./api/SdkDashboardId.md); `drillThroughQuestionHeight?`: `Height`\<`string` \| `number`\>; `drillThroughQuestionProps?`: [`DrillThroughQuestionProps`](./api/DrillThroughQuestionProps.md); `initialParameters?`: [`ParameterValues`](./api/ParameterValues.md); `onParametersChange?`: (`payload`: [`ParameterChangePayload`](./api/ParameterChangePayload.md)) => `void`; `parameters?`: [`ParameterValues`](./api/ParameterValues.md); `plugins?`: [`MetabasePluginsConfig`](./api/MetabasePluginsConfig.md); `renderDrillThroughQuestion?`: () => [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478); \} & \{ `dashboardId?`: [`SdkDashboardId`](./api/SdkDashboardId.md) \| `null`; `token?`: `string` \| `null`; \} & \{ `enableEntityNavigation?`: `boolean`; `hiddenParameters?`: `string`[]; `initialParameters?`: [`ParameterValues`](./api/ParameterValues.md); `withCardTitle?`: `boolean`; `withDownloads?`: `boolean`; `withSubscriptions?`: `boolean`; `withTitle?`: `boolean`; \} & \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579); \} & \{ `onLoad?`: (`dashboard`: [`MetabaseDashboard`](./api/MetabaseDashboard.md) \| `null`) => `void`; `onLoadWithoutCards?`: (`dashboard`: [`MetabaseDashboard`](./api/MetabaseDashboard.md) \| `null`) => `void`; `onVisualizationChange?`: (`visualization`: \| `"object"` \| `"table"` \| `"bar"` \| `"line"` \| `"pie"` \| `"scalar"` \| `"row"` \| `"area"` \| `"combo"` \| `"pivot"` \| `"smartscalar"` \| `"gauge"` \| `"progress"` \| `"funnel"` \| `"map"` \| `"scatter"` \| `"boxplot"` \| `"waterfall"` \| `"sankey"` \| `"treemap"` \| `"list"`) => `void`; \} & \{ `dataPickerProps?`: [`Pick`](https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys)\<[`SdkQuestionProps`](./api/SdkQuestionProps.md), `"entityTypes"`\>; \} & \{ \} |             |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L4240)

<!-- [<endsnippet returns>] -->
