---
name: metabase-semantic-schema-data-apps
description: Use when building or editing React dashboards, operations dashboards, or data apps from a Metabase semantic layer or generated schema file such as metabase.data.ts or *.metabase.data.ts.
---

# Metabase Semantic Schema Data Apps

## Core Rules

Keep the semantic layer and presentation layer separate.

- All Metabase context must come from the generated schema file, usually `src/metabase.data.ts` or `src/*.metabase.data.ts`.
- Do not discover data through MCP tools, create questions, create metrics, create tables, or edit the semantic layer while building the React UI.
- Use `useMetabaseQuery`, `filter(...)`, and `breakout(...)` from `@metabase/embedding-sdk-react`.
- Prefer generated schema objects over raw IDs or strings. Extract local constants for top-level semantic objects.
- Prefer semantically rich queries over shallow table dumps. Use curated metrics, table measures, segments, filters, and breakouts when they make the generated app more useful.
- Never invent aggregation or measure objects such as `{ name: "count" }` or `{ name: "sum", field: ... }`. Measures must come from `schema.tables.*.measures.*`; metrics must come from `schema.metrics.*`.
- Only render values returned by Metabase or deterministic transforms of returned values. Do not invent KPI values, trends, labels, statuses, ratings, timestamps, rankings, insights, customer segments, or chart series.
- Before rendering a field, verify it exists in the generated schema object and is returned by the query. Do not guess column names from business intuition or old mock data.
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
  breakout,
  filter,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

const lifetimeValueMetric = schema.metrics.customerLifetimeValue;
const lifetimeValueTable = schema.tables.customerLifetimeValue;

const { data, isLoading, error } = useMetabaseQuery({
  metric: lifetimeValueMetric,
  filters: [filter(lifetimeValueMetric.dimensions.orders, ">", 0)],
  measures: [lifetimeValueTable.measures.totalLtv],
  breakouts: [
    breakout(lifetimeValueMetric.dimensions.lastOrderedAt, { bucket: "month" }),
  ],
});
```

Use keyed schema objects:

- Saved questions: `questionId: schema.questions.someQuestion.id`
- Tables: `tableId: table.id`, `table.fields.*`, `table.segments.*`, `table.measures.*`
- Metrics: `metric: schema.metrics.someMetric`, `metric.dimensions.*`

Do not pass raw dimension strings like `"created_at"` or `"segment"`. Metric dimensions need generated UUID metadata.

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
  measures: [ordersTable.measures.revenue],
  breakouts: [breakout(ordersTable.fields.createdAt, { bucket: "month" })],
});
```

Table fields, segments, and measures must come from the queried table.
When table queries use `fields`, `segments`, `measures`, or `breakouts`, pass the table schema generic (`useMetabaseQuery<OrdersTable>`) so TypeScript can validate the query.

### Metrics

```ts
const revenueMetric = schema.metrics.revenue;

const { data } = useMetabaseQuery({
  metric: revenueMetric,
  filters: [filter(revenueMetric.dimensions.state, "=", "CA")],
  breakouts: [
    breakout(revenueMetric.dimensions.createdAt, { bucket: "month" }),
  ],
});
```

Metric filters and breakouts should use dimensions from the same metric object.

### Metrics With Measures

```ts
const lifetimeValueMetric = schema.metrics.customerLifetimeValue;
const lifetimeValueTable = schema.tables.customerLifetimeValue;

const { data } = useMetabaseQuery({
  metric: lifetimeValueMetric,
  measures: [lifetimeValueTable.measures.totalLtv],
  breakouts: [
    breakout(lifetimeValueMetric.dimensions.lastOrderedAt, { bucket: "month" }),
  ],
});
```

Measures must come from tables in the metric's `mappedTableIds`.

## Filters And Breakouts

Use helpers because they give better autocomplete and shorter errors.

```ts
filter(metric.dimensions.orders, ">", 0);
filter(metric.dimensions.segment, "contains", "delivery");
filter(metric.dimensions.orders, "between", [10, 20]);
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
  schema.tables.orders.segments.completedOrders,
  filter(schema.tables.orders.fields.total, ">", 100),
];
```

## Result Shape And Charts

- Prefer keyed `data.rows`.
- Inspect `data.columns` before mapping low-level `rawRows`.
- Use `rawRows` only for known positional shapes, such as multiple aggregation series.
- Metric-plus-measure queries commonly return `[breakout, metric aggregation, measure aggregation]`.
- Aggregation columns may be named `count`, `sum`, or `avg`; match metadata when needed.
- Grouped queries can include a `null` breakout bucket. Render it as `"Unknown"` or filter it out deliberately.
- Time-series charts need multiple ordered buckets. Do not fake sparklines for scalar or one-point results.
- Multi-series charts with different units or magnitudes need separate axes or normalization.
- Format user-facing values: currency to at most 2 decimals, counts as whole numbers, dates as readable labels.

## Important: TypeScript Checks

After changing queries, generated-schema usage, or React components that consume Metabase data, run the app's TypeScript check before finalizing. This is mandatory. Visual testing does not catch schema type errors.

Use the fastest type-only check available:

1. Prefer the app's existing typecheck script when present:

```bash
npm run typecheck
```

2. If no typecheck script exists, run TypeScript directly:

```bash
./node_modules/.bin/tsc --noEmit
```

Do not use a full build as the default query/type validation step. Builds are slower and often include bundling, asset generation, and unrelated production checks.

Do not skip this check because the app rendered, because browser automation passed, or because the change looks small.

Fix one query error at a time.

Common patterns:

- `filter(...)` overload error: operator does not match dimension type. Use `contains` for strings, `>`/`between` for numbers or dates.
- `bucket` error: dimension is not a date. Remove `bucket` or choose a date dimension.
- `dimension.id`, `dimension.name`, `metricId`, or `tableId` mismatch: field/dimension came from the wrong table or metric. Use dimensions from the same metric, or fields from the queried table.
- Segment/measure `tableId` mismatch: choose a segment/measure from the queried table or from a table in the metric's `mappedTableIds`.
- Runtime SQL error like `timestamp with time zone > integer`: TypeScript accepted the operator, but the value type is wrong. Use date values for date dimensions, numbers for number dimensions, strings for string dimensions.

## Presentation Guidance

The React app may group, sort, format, and derive display-only values from `data.rows`.

Good transforms:

- Group rows for summaries.
- Sort and slice rows for ranked lists.
- Pick chart types from actual data shape.
- Show loading, error, and empty states.

When a page feels like a raw table browser, look for schema-backed ways to enrich it:

- Use segments for curated subsets like active, completed, overdue, high-priority, or needs-attention records.
- Use measures for curated aggregations instead of recalculating everything ad hoc in React.
- Use filters to focus the query on the UI's intent.
- Use breakouts to create trends, category comparisons, and grouped summaries.

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
- Rendering fields that are not present in the schema or returned query result.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating nested `MetabaseProvider` instances instead of sharing one provider at the app boundary.
