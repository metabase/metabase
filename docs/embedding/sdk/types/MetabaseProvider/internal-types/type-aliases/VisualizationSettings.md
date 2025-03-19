```ts
type VisualizationSettings = {
[key: string]: any;   column_settings: Record<string, ColumnSettings>;
  funnel.rows: SeriesOrderSetting[];
  graph.dimensions: string[];
  graph.goal_label: string;
  graph.goal_value: number;
  graph.max_categories: number;
  graph.max_categories_enabled: boolean;
  graph.metrics: string[];
  graph.other_category_aggregation_fn: "sum" | "avg" | "min" | "max" | "stddev" | "median";
  graph.series_order: SeriesOrderSetting[];
  graph.show_goal: boolean;
  graph.show_stack_values: StackValuesDisplay;
  graph.show_trendline: boolean;
  graph.show_values: boolean;
  graph.x_axis.axis_enabled: true | false | "compact" | "rotate-45" | "rotate-90";
  graph.x_axis.scale: XAxisScale;
  graph.x_axis.title_text: string;
  graph.y_axis.axis_enabled: boolean;
  graph.y_axis.max: number;
  graph.y_axis.min: number;
  graph.y_axis.scale: YAxisScale;
  graph.y_axis.title_text: string;
  pie.colors: Record<string, string>;
  pie.decimal_places: number;
  pie.dimension: string | string[];
  pie.metric: string;
  pie.middle_dimension: string;
  pie.outer_dimension: string;
  pie.percent_visibility: "off" | "legend" | "inside" | "both";
  pie.rows: PieRow[];
  pie.show_labels: boolean;
  pie.show_legend: boolean;
  pie.show_total: boolean;
  pie.slice_threshold: number;
  pie.sort_rows: boolean;
  pivot_table.collapsed_rows: PivotTableCollapsedRowsSetting;
  pivot_table.column_split: PivotTableColumnSplitSetting;
  sankey.label_value_formatting: "auto" | "full" | "compact";
  sankey.node_align: "left" | "right" | "justify";
  sankey.show_edge_labels: boolean;
  sankey.source: string;
  sankey.target: string;
  sankey.value: string;
  scalar.compact_primary_number: boolean;
  scalar.comparisons: SmartScalarComparison[];
  scalar.field: string;
  scalar.switch_positive_negative: boolean;
  scatter.bubble: string;
  series_settings: Record<string, SeriesSettings>;
  stackable.stack_type: StackType;
  table.column_formatting: ColumnFormattingSetting[];
  table.columns: TableColumnOrderSetting[];
  waterfall.decrease_color: string;
  waterfall.increase_color: string;
  waterfall.show_total: boolean;
  waterfall.total_color: string;
 } & EmbedVisualizationSettings;
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `column_settings`? | `Record`\<`string`, [`ColumnSettings`](../interfaces/ColumnSettings.md)\> |
| `funnel.rows`? | [`SeriesOrderSetting`](SeriesOrderSetting.md)[] |
| `graph.dimensions`? | `string`[] |
| `graph.goal_label`? | `string` |
| `graph.goal_value`? | `number` |
| `graph.max_categories`? | `number` |
| `graph.max_categories_enabled`? | `boolean` |
| `graph.metrics`? | `string`[] |
| `graph.other_category_aggregation_fn`? | `"sum"` \| `"avg"` \| `"min"` \| `"max"` \| `"stddev"` \| `"median"` |
| `graph.series_order`? | [`SeriesOrderSetting`](SeriesOrderSetting.md)[] |
| `graph.show_goal`? | `boolean` |
| `graph.show_stack_values`? | [`StackValuesDisplay`](StackValuesDisplay.md) |
| `graph.show_trendline`? | `boolean` |
| `graph.show_values`? | `boolean` |
| `graph.x_axis.axis_enabled`? | `true` \| `false` \| `"compact"` \| `"rotate-45"` \| `"rotate-90"` |
| `graph.x_axis.scale`? | [`XAxisScale`](XAxisScale.md) |
| `graph.x_axis.title_text`? | `string` |
| `graph.y_axis.axis_enabled`? | `boolean` |
| `graph.y_axis.max`? | `number` |
| `graph.y_axis.min`? | `number` |
| `graph.y_axis.scale`? | [`YAxisScale`](YAxisScale.md) |
| `graph.y_axis.title_text`? | `string` |
| `pie.colors`? | `Record`\<`string`, `string`\> |
| `pie.decimal_places`? | `number` |
| `pie.dimension`? | `string` \| `string`[] |
| `pie.metric`? | `string` |
| `pie.middle_dimension`? | `string` |
| `pie.outer_dimension`? | `string` |
| `pie.percent_visibility`? | `"off"` \| `"legend"` \| `"inside"` \| `"both"` |
| `pie.rows`? | [`PieRow`](../interfaces/PieRow.md)[] |
| `pie.show_labels`? | `boolean` |
| `pie.show_legend`? | `boolean` |
| `pie.show_total`? | `boolean` |
| `pie.slice_threshold`? | `number` |
| `pie.sort_rows`? | `boolean` |
| `pivot_table.collapsed_rows`? | [`PivotTableCollapsedRowsSetting`](PivotTableCollapsedRowsSetting.md) |
| `pivot_table.column_split`? | [`PivotTableColumnSplitSetting`](PivotTableColumnSplitSetting.md) |
| `sankey.label_value_formatting`? | `"auto"` \| `"full"` \| `"compact"` |
| `sankey.node_align`? | `"left"` \| `"right"` \| `"justify"` |
| `sankey.show_edge_labels`? | `boolean` |
| `sankey.source`? | `string` |
| `sankey.target`? | `string` |
| `sankey.value`? | `string` |
| `scalar.compact_primary_number`? | `boolean` |
| `scalar.comparisons`? | [`SmartScalarComparison`](SmartScalarComparison.md)[] |
| `scalar.field`? | `string` |
| `scalar.switch_positive_negative`? | `boolean` |
| `scatter.bubble`? | `string` |
| `series_settings`? | `Record`\<`string`, [`SeriesSettings`](SeriesSettings.md)\> |
| `stackable.stack_type`? | [`StackType`](StackType.md) |
| `table.column_formatting`? | [`ColumnFormattingSetting`](ColumnFormattingSetting.md)[] |
| `table.columns`? | [`TableColumnOrderSetting`](TableColumnOrderSetting.md)[] |
| `waterfall.decrease_color`? | `string` |
| `waterfall.increase_color`? | `string` |
| `waterfall.show_total`? | `boolean` |
| `waterfall.total_color`? | `string` |
