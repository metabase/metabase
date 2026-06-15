---
name: metabase-data-app-semantic-layer
description: Use when building, creating, or editing data apps that should use Metabase data, a Metabase semantic layer, or generated schema files like metabase.data.ts or *.metabase.data.ts.
---

# Metabase Data App Semantic Layer

## Core Rules

Keep the semantic layer and presentation layer separate.

- All Metabase context must come from the generated schema file, usually `src/metabase.data.ts` or `src/*.metabase.data.ts`.
- Do not discover data through MCP tools, create questions, create metrics, create tables, or edit the semantic layer while building the React UI.
- Use `useMetabaseQuery`, `useMetabaseQueryObject`, `filter(...)`, and `breakout(...)` from `@metabase/embedding-sdk-react/data-app`.
- Data apps must install the published data-app SDK tag: `npm install @metabase/embedding-sdk-react@63-data-apps`.
- Prefer generated schema objects over raw IDs or strings. Extract local constants for top-level semantic objects.
- Prefer semantically rich queries over shallow table dumps. Use curated metrics, table measures, segments, filters, and breakouts when they make the generated app more useful.
- Prefer semantic-layer definitions over React-side inference. If the schema has a segment or measure for a concept, use it in the query instead of manually recreating the concept from raw rows.
- Never invent aggregation or measure objects such as `{ name: "count" }` or `{ name: "sum", field: ... }`. Measures must come from `schema.tables.*.measures.*`; metrics must come from `schema.metrics.*`.
- Only render values returned by Metabase or deterministic transforms of returned values. Do not invent KPI values, trends, labels, statuses, ratings, timestamps, rankings, insights, segments, or chart series.
- Visualization data must come from Metabase through `useMetabaseQuery`, `useMetabaseQueryObject` with `InteractiveQuestion`/`StaticQuestion`, or saved-question SDK components. Do not hardcode chart-ready arrays, sample data, demo values, or schema-shaped mock values.
- Before rendering a field, verify it exists in the generated schema object and is returned by the query. Do not guess column names from business intuition or old mock data.
- Avoid unsupported freshness or operational claims such as "real-time", "live", "understaffed", or "risk" unless the returned data or curated semantic-layer definition supports them.
- Before claiming the work is done or preparing a final handoff, run a TypeScript type-only check and report the command/result. If the check fails, fix the type errors before any final summary.

## Generate Schema

If the schema file already exists, use it. If it is missing or stale, treat schema generation as semantic-layer curation for this data app, not a mechanical export.

Before generating, ask which collections should be available to the app:

- `libraryCollections` for curated Data/Metrics library subcollections. These provide tables, fields, segments, measures, and metrics.
- `questionCollections` for saved questions from normal collections.

If the repository contains Metabase representation YAML, such as `collections/` or `databases/` folders, inspect those files enough to offer concrete collection choices by name. Otherwise ask the user for collection IDs or names.

Warn the user before exporting the whole instance. Including everything is noisy: it bloats context, makes agents more likely to pick irrelevant entities, and weakens the intended boundary between the curated semantic layer and the presentation layer.

Ask the user for a Metabase API key when needed, then generate the scoped schema:

```bash
curl \
  -o src/metabase.data.ts \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "Accept: text/typescript" \
  "http://localhost:3000/api/typed-schemas/v1/typescript?libraryCollections=24,25&questionCollections=10,11"
```

Other useful filters:

- `?database=Production` or `?database=1` for one database.
- No query parameters only when the user explicitly wants the whole instance.

## Standard Pattern

```ts
import {
  breakout,
  filter,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";
import schema from "../metabase.data";

const primaryMetric = schema.metrics.primaryMetric;
const sourceTable = schema.tables.sourceTable;

const { data, isLoading, error } = useMetabaseQuery({
  metric: primaryMetric,
  filters: [filter(primaryMetric.dimensions.quantity, ">", 0)],
  measures: [sourceTable.measures.totalAmount],
  breakouts: [
    breakout(primaryMetric.dimensions.createdAt, { bucket: "month" }),
  ],
});
```

Use keyed schema objects:

- Saved questions: `questionId: schema.questions.someQuestion.id`
- Tables: `tableId: table.id`, `table.fields.*`, `table.segments.*`, `table.measures.*`
- Metrics: `metric: schema.metrics.someMetric`, `metric.dimensions.*`

Do not pass raw dimension strings like `"created_at"` or `"segment"`. Metric dimensions need generated UUID metadata.

`useMetabaseQuery` and `useMetabaseQueryObject`/`createMetabaseQuery` take different shapes for tables:

- `useMetabaseQuery` (row-data hook): `{ tableId: table.id, ... }`.
- `useMetabaseQueryObject` / `createMetabaseQuery` (query-object for `InteractiveQuestion`/`StaticQuestion`): `{ table: table, ... }` — pass the full generated table object (it carries `databaseId`), not `tableId`.

Passing `tableId` to `useMetabaseQueryObject` throws `Query creation requires a generated table schema, generated metric schema, or databaseId.` at runtime.

## Query Recipes

### Saved Questions

```ts
const recordsQuestion = schema.questions.recordsTable;
type RecordsQuestion = typeof recordsQuestion;

const { data } = useMetabaseQuery<RecordsQuestion>({
  questionId: recordsQuestion.id,
});
```

Do not create row-mapping wrappers just to recover fields. The schema generic gives keyed rows.

### Tables

```ts
const recordsTable = schema.tables.records;
type RecordsTable = typeof recordsTable;

const { data } = useMetabaseQuery<RecordsTable>({
  tableId: recordsTable.id,
  filters: [
    recordsTable.segments.activeRecords,
    filter(recordsTable.fields.amount, ">", 100),
  ],
  aggregations: [recordsTable.measures.totalAmount],
  breakouts: [breakout(recordsTable.fields.createdAt, { bucket: "month" })],
});
```

For grouped counts, use a curated count measure from the generated schema:

```ts
useMetabaseQuery<RecordsTable>({
  tableId: recordsTable.id,
  filters: [recordsTable.segments.activeRecords],
  aggregations: [recordsTable.measures.recordCount],
  breakouts: [breakout(recordsTable.fields.category)],
});
```

For basic field aggregations, use curated measures from the generated schema. If the app needs `sum`, `avg`, `median`, `distinct`, `min`, or `max` and the schema does not expose a matching measure, stop and ask the user to add that measure upstream before continuing.

```ts
useMetabaseQuery<RecordsTable>({
  tableId: recordsTable.id,
  aggregations: [
    recordsTable.measures.totalAmount,
    recordsTable.measures.averageAmount,
  ],
  breakouts: [breakout(recordsTable.fields.createdAt, { bucket: "month" })],
});
```

Table fields, segments, and measure aggregations must come from the queried table.
When table queries use `fields`, `segments`, `aggregations`, or `breakouts`, pass the table schema generic (`useMetabaseQuery<RecordsTable>`) so TypeScript can validate the query.

### Metrics

```ts
const primaryMetric = schema.metrics.primaryMetric;

const { data } = useMetabaseQuery({
  metric: primaryMetric,
  filters: [filter(primaryMetric.dimensions.status, "=", "active")],
  breakouts: [
    breakout(primaryMetric.dimensions.createdAt, { bucket: "month" }),
  ],
});
```

Metric filters and breakouts should use dimensions from the same metric object.

### Metrics With Measures

```ts
const primaryMetric = schema.metrics.primaryMetric;
const sourceTable = schema.tables.sourceTable;

const { data } = useMetabaseQuery({
  metric: primaryMetric,
  measures: [sourceTable.measures.totalAmount],
  breakouts: [
    breakout(primaryMetric.dimensions.createdAt, { bucket: "month" }),
  ],
});
```

Measures must come from tables in the metric's `mappedTableIds`.

## Interactive Metabase Views

Use Metabase's SDK `InteractiveQuestion` or `StaticQuestion` by default when the UI can be expressed as a normal Metabase question visualization. Build a semantic query with `useMetabaseQueryObject`, then pass the query object to the SDK question component.

`useMetabaseQueryObject` supports generated table objects and generated metric objects. Use `useMetabaseQuery` when custom React needs direct row data; use `useMetabaseQueryObject` when Metabase should render or manage the visualization.

Metabase supports these question displays: `table`, `bar`, `line`, `pie`, `scalar`, `row`, `area`, `combo`, `pivot`, `smartscalar`, `gauge`, `progress`, `funnel`, `object`, `map`, `scatter`, `boxplot`, `waterfall`, `sankey`, and `list`.

Prefer `InteractiveQuestion` for:

- standard charts, pivot tables, maps, object/list views, scalar/KPI values, and exploratory views
- trends, category comparisons, grouped summaries, geographic views, scatter plots, funnels, gauges, progress, waterfall, boxplot, and sankey-shaped queries
- bar, line, area, row, and trend charts whenever a semantic query with measures and breakouts can produce the needed result
- tables where users benefit from Metabase interactions such as sorting, column inspection, drill-through, downloading, or changing visualization settings
- cases where Metabase visualization settings can handle the presentation, such as axes, labels, stacking, goals, trendlines, split panels, series settings, table columns, formatting, pie settings, pivot settings, and list settings

Generated dashboards should use Metabase charts as much as possible. Do not replace a normal bar, line, area, row, trend, pivot, map, or sortable table with a custom SVG/React visualization just to make it look more bespoke.

Use custom React visualizations only when the user's requested presentation does not fit Metabase display types or visualization settings.

Good custom visualization reasons:

- bespoke scorecards, alert panels, narrative layouts, or mixed-content cards that cannot be represented as a normal Metabase chart/table
- combining multiple Metabase queries into one visual unit
- custom interactions or product-specific UI that Metabase's chart/table chrome cannot express
- unusual chart forms such as calendar grids, timelines, heat strips, radial views, custom maps, or domain-specific diagrams

For custom charts, use an existing charting dependency when the app already has one. Otherwise, SVG charts are fine. Keep metric-only KPI cards and bespoke summaries on `useMetabaseQuery` when you need direct row data, but first consider whether an SDK scalar/smartscalar/gauge/progress view would be good enough.

Chart only, without the toolbar:

```tsx
import {
  InteractiveQuestion,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";
import {
  breakout,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";

const eventsTable = schema.tables.events;

const trendQuery = useMetabaseQueryObject({
  table: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { bucket: "month" })],
});

return (
  <InteractiveQuestion query={trendQuery}>
    <InteractiveQuestion.QuestionVisualization />
  </InteractiveQuestion>
);
```

Full interactive question, with the query toolbar:

```tsx
const trendQuery = useMetabaseQueryObject({
  table: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { bucket: "month" })],
});

return <InteractiveQuestion query={trendQuery} />;
```

Static question:

```tsx
const trendQuery = useMetabaseQueryObject({
  table: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { bucket: "month" })],
});

return <StaticQuestion query={trendQuery} />;
```

Metric-backed SDK question:

```tsx
const primaryMetric = schema.metrics.primaryMetric;
const sourceTable = schema.tables.sourceTable;

const metricTrendQuery = useMetabaseQueryObject({
  metric: primaryMetric,
  measures: [sourceTable.measures.totalAmount],
  breakouts: [breakout(primaryMetric.dimensions.createdAt, { bucket: "month" })],
});

return (
  <InteractiveQuestion query={metricTrendQuery}>
    <InteractiveQuestion.QuestionVisualization />
  </InteractiveQuestion>
);
```

Do not wrap `InteractiveQuestion` or `StaticQuestion` in containers that clip or move on hover. Avoid `overflow: hidden`, hover transforms, and hover-driven layout shifts around embedded Metabase UI; popovers, menus, and chart tooltips need stable geometry and visible overflow.

## Filters And Breakouts

Use helpers because they give better autocomplete and shorter errors.

```ts
filter(metric.dimensions.quantity, ">", 0);
filter(metric.dimensions.segment, "contains", "standard");
filter(metric.dimensions.quantity, "between", [10, 20]);
filter(metric.dimensions.segment, "not-empty");

breakout(metric.dimensions.createdAt, { bucket: "month" });
breakout(metric.dimensions.amount, {
  binning: { strategy: "num-bins", "num-bins": 10 },
});
breakout(metric.dimensions.state);
```

Filter operator rules:

- string: `=`, `!=`, `contains`, `does-not-contain`, `starts-with`, `ends-with`, `is-empty`, `not-empty`, `is-null`, `not-null`
- number: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `is-null`, `not-null`
- date: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `time-interval`, `is-null`, `not-null`
- boolean: `=`, `is-null`, `not-null`

Only date dimensions can use `bucket`. Non-date dimensions can be used as breakouts without `bucket`; numeric dimensions can use `binning`.

Segments are already filters:

```ts
filters: [
  schema.tables.records.segments.activeRecords,
  filter(schema.tables.records.fields.amount, ">", 100),
];
```

Use curated segments first when they exactly match the product intent. Use `filter(...)` when the UI needs a threshold, category, date range, text match, boolean condition, or other narrowing that is not already represented by a curated segment.

```ts
const eventsTable = schema.tables.events;
type EventsTable = typeof eventsTable;

const { data } = useMetabaseQuery<EventsTable>({
  tableId: eventsTable.id,
  filters: [
    eventsTable.segments.recentRecords,
    filter(eventsTable.fields.amount, ">", 1000),
  ],
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { bucket: "day" })],
});
```

## Result Shape And Charts

- Prefer keyed `data.rows`.
- Inspect `data.columns` before mapping low-level `rawRows`.
- Runtime row objects are keyed by returned Metabase column names, usually `column.name` such as `total_amount` or `average_score`. Do not assume generated schema keys like `totalAmount` or `averageScore` are runtime row keys.
- Treat row values as nullable. Guard before calling number/string methods such as `toFixed`, `toLocaleString`, or string transforms.
- Use `rawRows` only for known positional shapes, such as multiple aggregation series.
- Metric-plus-measure queries commonly return `[breakout, metric aggregation, measure aggregation]`.
- Aggregation columns may be named `count`, `sum`, or `avg`; match metadata when needed.
- Grouped queries can include a `null` breakout bucket. Render it as `"Unknown"` or filter it out deliberately.
- Time-series charts need multiple ordered buckets. Do not fake sparklines for scalar or one-point results.
- Multi-series charts with different units or magnitudes need separate axes or normalization.
- Format user-facing values: currency to at most 2 decimals, counts as whole numbers, dates as readable labels.
- Do not render ambiguous derived business metrics unless the semantic layer description or inspected sample values make the meaning and units obvious. This includes fields named like `margin`, `rate`, `score`, `percent`, `health`, `risk`, or `efficiency`.
- Do not multiply by 100, add `%`, bucket into health/risk labels, or invent interpretation for ambiguous fields without evidence. Prefer omitting the field over guessing.
- If a ratio is needed, derive it explicitly from returned numerator and denominator fields with clear labels. If the source value is an amount, format it as an amount.
- Empty results are distinct from loading. After `isLoading` is false, render a clear empty state instead of leaving a skeleton or blank KPI.

## Presentation Guidance

Prefer Metabase-rendered panels for chart-shaped and table-shaped data. The React app may group, sort, format, and derive display-only values from `data.rows` when a custom panel is justified, but do not make custom panels the default.

Good transforms:

- Group rows for summaries.
- Sort and slice rows for ranked lists only when a custom list is clearly better than a Metabase row/bar/table visualization.
- Pick chart types from actual data shape, and prefer Metabase `bar`, `line`, `area`, `row`, `combo`, `pivot`, and `table` displays before writing custom chart code.
- Show loading, error, and empty states.
- Bound dense result displays. Tables, alert lists, logs, and ranked lists should use a top-N slice, grouping, pagination, or a fixed/max-height scroll area so a large result set cannot stretch the entire page.

When a page feels like a raw table browser, look for schema-backed ways to enrich it:

- Use segments for curated subsets like active, completed, overdue, high-priority, or needs-attention records.
- Use measures for curated aggregations instead of recalculating everything ad hoc in React.
- Use filters to focus the query on the UI's intent.
- Use breakouts to create trends, category comparisons, and grouped summaries.
- If the enriched result is still a sortable/drillable table, render it with `InteractiveQuestion` instead of rebuilding table behavior in React.

Avoid manual classification when the semantic layer already has the concept. Prefer curated segments, fields, metrics, or measures over string matching, threshold heuristics, or category reconstruction in React.

If no curated schema entry supports the intended UI, leave the section out or ask for semantic-layer curation. Do not keep mock data or placeholder analytics in the finished app.

## Common Mistakes

- Creating or searching for Metabase content during app building.
- Importing older hooks instead of `useMetabaseQuery`.
- Using `metricId` for new metric queries instead of `metric: schema.metrics.someMetric`.
- Copying raw numeric IDs into constants instead of using generated `.id` values.
- Inventing ad hoc measure objects such as `{ name: "count" }` or `{ name: "sum", field: fieldId }`.
- Passing raw strings for metric dimensions or table fields.
- Adding lookup helpers instead of using keyed generated schema objects.
- Mixing fields, dimensions, segments, or measures from unrelated tables/metrics.
- Assuming `filter(...)` fully validates value types.
- Letting a `null` bucket become the latest time-series point.
- Hardcoding business values, labels, timestamps, or rankings.
- Creating chart-ready arrays by hand instead of deriving them from queried `data.rows`.
- Rendering fields that are not present in the schema or returned query result.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating nested `MetabaseProvider` instances instead of sharing one provider at the app boundary.
