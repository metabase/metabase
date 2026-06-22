---
name: metabase-semantic-schema-data-apps
description: Use when building React dashboards or data apps from a Metabase semantic layer, including generated schema files like metabase.data.ts or *.metabase.data.ts.
---

# Metabase Semantic Schema Data Apps

## Core Rules

Keep the semantic layer and presentation layer separate.

- All Metabase context must come from the generated schema file, usually `src/metabase.data.ts` or `src/*.metabase.data.ts`.
- Do not discover data through MCP tools, create questions, create metrics, create tables, or edit the semantic layer while building the React UI.
- Use `useMetabaseQuery`, `useMetabaseQueryObject`, `filter(...)`, and `breakout(...)` from `@metabase/embedding-sdk-react/data-app`.
- Prefer generated schema objects over raw IDs or strings. Extract local constants for top-level semantic objects.
- Prefer semantically rich queries over shallow table dumps. Use curated metrics, table measures, segments, filters, and breakouts when they make the generated app more useful.
- Prefer semantic-layer definitions over React-side inference. If the schema has a segment or measure for a concept, use it in the query instead of manually recreating the concept from raw rows.
- Never invent aggregation or measure objects such as `{ name: "count" }` or `{ name: "sum", field: ... }`. Measures must come from `schema.tables.*.measures.*`; metrics must come from `schema.metrics.*`.
- Only render values returned by Metabase or deterministic transforms of returned values. Do not invent KPI values, trends, labels, statuses, ratings, timestamps, rankings, insights, customer segments, or chart series.
- Visualization data must come from Metabase through `useMetabaseQuery`, `useMetabaseQueryObject` with `InteractiveQuestion`/`StaticQuestion`, or saved-question SDK components. Do not hardcode chart-ready arrays, sample data, demo values, or schema-shaped mock values.
- Before rendering a field, verify it exists in the generated schema object and is returned by the query. Do not guess column names from business intuition or old mock data.
- Avoid unsupported freshness or operational claims such as "real-time", "live", "understaffed", or "risk" unless the returned data or curated semantic-layer definition supports them.
- Before claiming the work is done or preparing a final handoff, run a TypeScript type-only check and report the command/result. If the check fails, fix the type errors before any final summary.

## Generate Schema

If the schema file is missing or stale, ask the user for a Metabase API key:

```bash
curl \
  -o src/metabase.data.ts \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "Accept: text/typescript" \
  http://localhost:3000/api/typed-schemas/v1/typescript
```

Useful filters:

- `?database=Boba` or `?database=1` for one database.
- `?libraryCollections=24,25` for curated Data/Metrics library subcollections.
- `?questionCollections=10,11` for saved questions from normal collections.

Use `libraryCollections` for semantic-layer tables, segments, measures, and metrics. Use `questionCollections` for saved questions.

## Standard Pattern

```ts
import {
  avg,
  breakout,
  count,
  filter,
  sum,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";
import schema from "../metabase.data";

const lifetimeValueMetric = schema.metrics.customerLifetimeValue;
const lifetimeValueTable = schema.tables.customerLifetimeValue;

const { data, isLoading, error } = useMetabaseQuery({
  metric: lifetimeValueMetric,
  filters: [
    filter(lifetimeValueMetric.dimensions.customerLifetimeValue.orders, ">", 0),
  ],
  measures: [lifetimeValueTable.measures.totalLtv],
  breakouts: [
    breakout(
      lifetimeValueMetric.dimensions.customerLifetimeValue.lastOrderedAt,
      { bucket: "month" },
    ),
  ],
});
```

Use keyed schema objects:

- Saved questions: `questionId: schema.questions.someQuestion.id`
- Tables: `tableId: table.id`, `table.fields.*`, `table.segments.*`, `table.measures.*`
- Metrics: `metric: schema.metrics.someMetric`, `metric.dimensions.<table>.*`

Do not pass raw dimension strings like `"created_at"` or `"segment"`. Metric dimensions are compact table-namespaced aliases to the valid fields for that metric; use `metric.dimensions.<table>.*` for the shortest safe path. Do not use `schema.tables.*.fields.*` as metric filters or breakouts unless the same field is exposed under `metric.dimensions`.

## Query Recipes

### Saved Questions

```ts
const customersQuestion = schema.questions.koiBobaAppCustomersTable;
type CustomersQuestion = typeof customersQuestion;

const { data } = useMetabaseQuery<CustomersQuestion>({
  questionId: customersQuestion.id,
});
```

Do not create row-mapping wrappers just to recover fields. The schema generic gives keyed rows.

### Tables

```ts
const ordersTable = schema.tables.orders;
type OrdersTable = typeof ordersTable;

const { data } = useMetabaseQuery<OrdersTable>({
  tableId: ordersTable.id,
  filters: [
    ordersTable.segments.completedOrders,
    filter(ordersTable.fields.total, ">", 100),
  ],
  aggregations: [ordersTable.measures.revenue],
  breakouts: [breakout(ordersTable.fields.createdAt, { bucket: "month" })],
});
```

For grouped counts, use `count()`:

```ts
useMetabaseQuery({
  table: ordersTable,
  filters: [ordersTable.segments.completedOrders],
  aggregations: [count()],
  breakouts: [breakout(ordersTable.fields.paymentMethod)],
});
```

For basic field aggregations, use helpers such as `sum(field)`, `avg(field)`, `median(field)`, `distinct(field)`, `min(field)`, and `max(field)`:

```ts
useMetabaseQuery({
  table: ordersTable,
  aggregations: [sum(ordersTable.fields.total), avg(ordersTable.fields.total)],
  breakouts: [breakout(ordersTable.fields.createdAt, { bucket: "month" })],
});
```

Table fields, segments, and measure aggregations must come from the queried table.
When table queries use `fields`, `segments`, `aggregations`, or `breakouts`, pass the table schema generic (`useMetabaseQuery<OrdersTable>`) so TypeScript can validate the query.

### Metrics

```ts
const revenueMetric = schema.metrics.revenue;

const { data } = useMetabaseQuery({
  metric: revenueMetric,
  filters: [filter(revenueMetric.dimensions.orders.state, "=", "CA")],
  breakouts: [
    breakout(revenueMetric.dimensions.orders.createdAt, { bucket: "month" }),
  ],
});
```

Metric filters and breakouts should use `metric.dimensions.<table>.*`. Those dimensions are generated only for fields Metabase exposes as valid dimensions for the metric, and preserve field operator/bucket type safety.

### Metrics With Measures

```ts
const lifetimeValueMetric = schema.metrics.customerLifetimeValue;
const lifetimeValueTable = schema.tables.customerLifetimeValue;

const { data } = useMetabaseQuery({
  metric: lifetimeValueMetric,
  measures: [lifetimeValueTable.measures.totalLtv],
  breakouts: [
    breakout(
      lifetimeValueMetric.dimensions.customerLifetimeValue.lastOrderedAt,
      { bucket: "month" },
    ),
  ],
});
```

Measures must come from tables in the metric's `mappedTableIds`. Fields, segments, and measures from unmapped tables are rejected by TypeScript and at runtime.

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
  breakout,
  count,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";

const dailyRevenue = schema.tables.dailyStoreRevenue;

const revenueQuery = useMetabaseQueryObject({
  table: dailyRevenue,
  aggregations: [dailyRevenue.measures.sumOfNetRevenue],
  breakouts: [breakout(dailyRevenue.fields.orderDate, { bucket: "month" })],
});

return (
  <InteractiveQuestion query={revenueQuery}>
    <InteractiveQuestion.QuestionVisualization />
  </InteractiveQuestion>
);
```

Full interactive question, with the query toolbar:

```tsx
const revenueQuery = useMetabaseQueryObject({
  table: dailyRevenue,
  aggregations: [dailyRevenue.measures.sumOfNetRevenue],
  breakouts: [breakout(dailyRevenue.fields.orderDate, { bucket: "month" })],
});

return <InteractiveQuestion query={revenueQuery} />;
```

Static question:

```tsx
const revenueQuery = useMetabaseQueryObject({
  table: dailyRevenue,
  aggregations: [dailyRevenue.measures.sumOfNetRevenue],
  breakouts: [breakout(dailyRevenue.fields.orderDate, { bucket: "month" })],
});

return <StaticQuestion query={revenueQuery} />;
```

Metric-backed SDK question:

```tsx
const revenueMetric = schema.metrics.revenue;
const ordersTable = schema.tables.orders;

const revenueByMonthQuery = useMetabaseQueryObject({
  metric: revenueMetric,
  measures: [ordersTable.measures.totalRevenue],
  breakouts: [
    breakout(revenueMetric.dimensions.orders.createdAt, { bucket: "month" }),
  ],
});

return (
  <InteractiveQuestion query={revenueByMonthQuery}>
    <InteractiveQuestion.QuestionVisualization />
  </InteractiveQuestion>
);
```

Do not wrap `InteractiveQuestion` or `StaticQuestion` in containers that clip or move on hover. Avoid `overflow: hidden`, hover transforms, and hover-driven layout shifts around embedded Metabase UI; popovers, menus, and chart tooltips need stable geometry and visible overflow.

## Filters And Breakouts

Use helpers because they give better autocomplete and shorter errors.

```ts
filter(metric.dimensions.orders.total, ">", 0);
filter(metric.dimensions.customers.segment, "contains", "delivery");
filter(metric.dimensions.orders.total, "between", [10, 20]);
filter(metric.dimensions.customers.segment, "not-empty");

breakout(metric.dimensions.orders.createdAt, { bucket: "month" });
breakout(metric.dimensions.orders.amount, {
  binning: { strategy: "num-bins", "num-bins": 10 },
});
breakout(metric.dimensions.customers.state);
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
  schema.tables.orders.segments.completedOrders,
  filter(schema.tables.orders.fields.total, ">", 100),
];
```

Use curated segments first when they exactly match the product intent. Use `filter(...)` when the UI needs a threshold, category, date range, text match, boolean condition, or other narrowing that is not already represented by a curated segment.

```ts
const dailyRevenue = schema.tables.dailyStoreRevenue;
type DailyRevenue = typeof dailyRevenue;

const { data } = useMetabaseQuery<DailyRevenue>({
  tableId: dailyRevenue.id,
  filters: [
    dailyRevenue.segments.ordersFromThisMonth,
    filter(dailyRevenue.fields.netRevenue, ">", 1000),
  ],
  aggregations: [dailyRevenue.measures.sumOfNetRevenue],
  breakouts: [breakout(dailyRevenue.fields.orderDate, { bucket: "day" })],
});
```

## Result Shape And Charts

- Prefer keyed `data.rows`.
- Inspect `data.columns` before mapping low-level `rawRows`.
- Runtime row objects are keyed by returned Metabase column names, usually `column.name` such as `net_revenue` or `avg_rating`. Do not assume generated schema keys like `netRevenue` or `avgRating` are runtime row keys.
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
