# SDK Visualization Settings

Use this as a quick orientation guide. The installed SDK types are always the source of truth: search `node_modules/@metabase/embedding-sdk-react/dist/index.d.ts` for `export declare type MetabaseCard` and the relevant `*VisualizationSettings` type before writing settings.

## How To Choose Settings

- Prefer `card` plus `visualizationSettings` when the app needs a specific display, axis label, stacking, series order, value labels, pie labels, or similar chart configuration.
- Use `useMetabaseQueryObject` to build the query. Do not call `createMetabaseQuery` directly.
- Set only the few settings that express the design intent. Let Metabase choose defaults for dimensions, metrics, colors, and formatting when the query shape is obvious.
- Use result column names in settings such as `graph.dimensions`, `graph.metrics`, `pie.dimension`, `pie.metric`, `scalar.field`, `sankey.source`, and `scatter.bubble`. If you are not sure what column names the query will produce, avoid those keys and use safer presentation settings instead.
- Keep `column_settings`, `series_settings`, row ordering, and per-slice colors minimal. They depend on exact result keys and can break when the query changes.

## Source Lookup

Use targeted searches instead of reading the whole declaration file:

```bash
rg -n "export declare type MetabaseCard|declare interface MetabaseCardBase|declare type .*VisualizationSettings|declare type VisualizationSettings" node_modules/@metabase/embedding-sdk-react/dist/index.d.ts
```

When the app has an older SDK package, also check:

```bash
rg -n "useMetabaseQueryObject|UseMetabaseQueryObjectResult" node_modules/@metabase/embedding-sdk-react/dist/data-app.d.ts
```

If `useMetabaseQueryObject` and `MetabaseCard` expose incompatible opaque `DatasetQuery` symbols, do not cast through `any`; use the bare `query` prop until the package is updated.

## Setting Families

### Cartesian: bar, line, area, combo, row

- `graph.dimensions`: result columns used for x-axis/category/grouping. Usually let Metabase infer this unless you need a specific split.
- `graph.metrics`: result metric columns to plot. Useful when the query returns multiple numeric columns.
- `graph.series_order`: explicit order, labels, colors, and enabled state for breakout series. Only use when you know the series keys.
- `graph.show_values`: show data labels on the chart.
- `graph.show_trendline`: add a trend line. Best for time-based trends without extra groupings.
- `graph.show_goal`, `graph.goal_value`, `graph.goal_label`: draw and label a goal line.
- `graph.x_axis.title_text`, `graph.y_axis.title_text`: override axis labels.
- `graph.x_axis.scale`: x-axis scale such as ordinal, timeseries, histogram, linear, pow, or log.
- `graph.y_axis.scale`: y-axis numeric scale such as linear, pow, or log.
- `graph.y_axis.auto_range`, `graph.y_axis.min`, `graph.y_axis.max`: control y-axis bounds.
- `graph.x_axis.axis_enabled`, `graph.y_axis.axis_enabled`: hide, compact, or rotate axes where supported.
- `stackable.stack_type`: stack bar/area series. Use `stacked`, `normalized`, or `null`.
- `series_settings`: per-series labels, colors, and display tweaks. Use sparingly because keys are data-dependent.
- `column_settings`: per-column formatting. Prefer only stable column keys.

### Scatter

- `graph.dimensions`: x-axis numeric column.
- `graph.metrics`: y-axis numeric column.
- `scatter.bubble`: optional numeric column for bubble size.
- `graph.x_axis.scale`, `graph.y_axis.scale`: numeric axis scale.
- `series_settings`, `column_settings`: optional per-series or per-column formatting.

### Waterfall

- `graph.dimensions`: category or time column for waterfall steps.
- `graph.metrics`: numeric value column.
- `graph.show_values`: show step labels.
- `waterfall.increase_color`, `waterfall.decrease_color`, `waterfall.total_color`: override colors.
- `waterfall.show_total`: add a final total bar.
- `column_settings`: per-column formatting.

### Table, pivot, object, list

- `table.columns`: visible columns and order, as `{ name, enabled }` entries.
- `table.column_formatting`: conditional formatting rules.
- `pivot_table.column_split`: pivot column selection.
- `pivot_table.collapsed_rows`: initially collapsed pivot rows.
- `column_settings`: column titles, number/currency formatting, and click behavior.

The `list` display currently shares the table settings surfaced through `MetabaseCard`; list-specific raw settings are not exposed there yet.

### Pie

- `pie.dimension`: one or more slice dimension columns.
- `pie.metric`: numeric value column.
- `pie.sort_rows`: sort slices by metric value.
- `pie.show_legend`: show the legend.
- `pie.show_total`: show total in the center.
- `pie.show_labels`: show slice labels.
- `pie.percent_visibility`: place percentages in the legend, inside slices, both, or off.
- `pie.decimal_places`: percentage precision.
- `pie.slice_threshold`: group tiny slices under "Other".
- `pie.colors`: legacy slice color map. Prefer defaults unless specific colors matter.
- `column_settings`: formatting for metric or dimension columns.

### Scalar, smartscalar, gauge, progress

- `scalar.field`: result column to display as the main value.
- `scalar.switch_positive_negative`: reverse good/bad direction for comparisons.
- `scalar.compact_primary_number`: compact the main number.
- `scalar.comparisons`: smart-scalar comparison configuration. Use only when the query shape clearly supports it.
- `column_settings`: number, currency, and title formatting.

Gauge/progress-specific raw settings are not surfaced through the current `MetabaseCard` type; use the scalar settings above and let Metabase defaults handle the rest.

### Funnel

- `funnel.rows`: explicit order, labels, colors, and enabled state for funnel steps. Only use when you know the row keys.
- `column_settings`: value formatting.

### Sankey

- `sankey.source`: source node column.
- `sankey.target`: target node column.
- `sankey.value`: numeric flow value column.
- `sankey.node_align`: node alignment, such as left, right, or justify.
- `sankey.show_edge_labels`: show flow labels.
- `column_settings`: formatting for source, target, or value columns.

### Boxplot

- `boxplot.whisker_type`: whisker calculation, such as Tukey or min-max.
- `boxplot.points_mode`: show no points, outliers only, or all points.
- `boxplot.show_mean`: show the mean marker.
- `boxplot.show_values_mode`: show median values or all values.
- `column_settings`: formatting.

### Map

- `column_settings`: column formatting only.

Map-specific raw settings are not surfaced through the current `MetabaseCard` type. Do not invent `map.*` settings unless the installed SDK type exposes them.

### Custom Visualizations

`custom:*` visualizations accept `Record<string, unknown>` for settings. Use only when the app has a known custom visualization contract.
