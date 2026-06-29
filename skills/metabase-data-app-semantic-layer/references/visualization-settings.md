# SDK Visualization Settings

Use this as a quick orientation guide. The installed SDK types are always the source of truth: search `node_modules/@metabase/embedding-sdk-react/dist/index.d.ts` for `MetabaseCard`, the relevant `*VisualizationSettings` type, and any setting key before writing settings. The SDK declaration includes lightweight descriptions for the supported setting families and keys.

## How To Choose Settings

- Start with `card={{ query }}` when the user has not asked for a specific chart type and Metabase defaults can infer a reasonable display from the query.
- Use `card={{ query, visualization }}` when the user request or design calls for a specific chart type, such as a pie chart for a distribution, but does not ask for setting-level customization.
- Use `card={{ query, visualization, visualizationSettings }}` only when the user explicitly asks for a setting-level presentation change, such as hiding or renaming an axis label, showing value labels, stacking bars, adding a goal line, ordering table columns, showing pie totals/labels, or controlling series/slice order.
- Use `useMetabaseQueryObject` to build the query. Do not call `createMetabaseQuery` directly.
- Set only the few settings that express the requested setting-level change. Let Metabase choose defaults for dimensions, metrics, colors, and formatting when the query shape is obvious.
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

If `useMetabaseQueryObject` and `MetabaseCard` expose incompatible opaque `DatasetQuery` symbols, do not cast through `any`; update the SDK package before using `card`.

## Setting Families

Read the setting-family docstrings from the installed SDK declaration:

- `CartesianVisualizationSettings`: bar, line, area, combo, row
- `ScatterVisualizationSettings`: scatter plots
- `WaterfallVisualizationSettings`: waterfall charts
- `TableVisualizationSettings`: table, pivot, object detail, list
- `PieVisualizationSettings`: pie and donut charts
- `ScalarVisualizationSettings`: scalar, smartscalar, gauge, progress
- `FunnelVisualizationSettings`: funnel charts
- `SankeyVisualizationSettings`: Sankey charts
- `BoxplotVisualizationSettings`: box plots
- `MapVisualizationSettings`: pin and region maps

For individual setting behavior, search the same declaration for the key, such as `graph.dimensions`, `pie.dimension`, `sankey.source`, or `boxplot.whisker_type`. Do not invent settings that are not exposed by the installed SDK type. Custom `custom:*` visualizations accept `Record<string, unknown>` settings only when the app has a known custom visualization contract.
