```ts
function EditableDashboard(
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
    children?: ReactNode;
  } & {
    dataPickerProps?: Pick<SdkQuestionProps, "entityTypes" | "dataPicker">;
  },
): Element;
```

A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard.

## Parameters

<!-- [<snippet parameters>] -->

| Parameter | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Description |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| `props`   | \{ `autoRefreshInterval?`: `number`; `dashboardId`: [`SdkDashboardId`](./api/SdkDashboardId.md); `drillThroughQuestionHeight?`: `Height`\<`string` \| `number`\>; `drillThroughQuestionProps?`: [`DrillThroughQuestionProps`](./api/DrillThroughQuestionProps.md); `initialParameters?`: [`ParameterValues`](./api/ParameterValues.md); `onParametersChange?`: (`payload`: [`ParameterChangePayload`](./api/ParameterChangePayload.md)) => `void`; `parameters?`: [`ParameterValues`](./api/ParameterValues.md); `plugins?`: [`MetabasePluginsConfig`](./api/MetabasePluginsConfig.md); `renderDrillThroughQuestion?`: () => [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478); \} & \{ `dashboardId?`: [`SdkDashboardId`](./api/SdkDashboardId.md) \| `null`; `token?`: `string` \| `null`; \} & \{ `enableEntityNavigation?`: `boolean`; `hiddenParameters?`: `string`[]; `initialParameters?`: [`ParameterValues`](./api/ParameterValues.md); `withCardTitle?`: `boolean`; `withDownloads?`: `boolean`; `withSubscriptions?`: `boolean`; `withTitle?`: `boolean`; \} & \{ `className?`: `string`; `style?`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579); \} & \{ `onLoad?`: (`dashboard`: [`MetabaseDashboard`](./api/MetabaseDashboard.md) \| `null`) => `void`; `onLoadWithoutCards?`: (`dashboard`: [`MetabaseDashboard`](./api/MetabaseDashboard.md) \| `null`) => `void`; `onVisualizationChange?`: (`visualization`: \| `"object"` \| `"table"` \| `"bar"` \| `"line"` \| `"pie"` \| `"scalar"` \| `"row"` \| `"area"` \| `"combo"` \| `"pivot"` \| `"smartscalar"` \| `"gauge"` \| `"progress"` \| `"funnel"` \| `"map"` \| `"scatter"` \| `"boxplot"` \| `"waterfall"` \| `"sankey"` \| `"treemap"` \| `"list"`) => `void`; \} & \{ `children?`: [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478); \} & \{ `dataPickerProps?`: [`Pick`](https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys)\<[`SdkQuestionProps`](./api/SdkQuestionProps.md), `"entityTypes"` \| `"dataPicker"`\>; \} |             |

<!-- [<endsnippet parameters>] -->

## Returns

<!-- [<snippet returns>] -->

[`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L4240)

<!-- [<endsnippet returns>] -->
