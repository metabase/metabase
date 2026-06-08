---
name: metabase-semantic-schema-data-apps
description: Use when building React data apps from curated Metabase typed schema exports with the Embedding SDK query hook.
---

# Metabase Semantic Schema Data Apps

## Core Rule

Keep the semantic layer and presentation layer separate.

All Metabase instance context must come from the curated generated schema file, usually `src/metabase.data.ts`. Do not discover data, create questions, create metrics, create tables, or edit the semantic layer while building the React UI. Questions, tables, metrics, segments, and measures in the schema are curated upstream.

## Generate Schema

If `src/metabase.data.ts` is missing or stale, ask the user for a Metabase API key and generate it:

```bash
curl \
  -o src/metabase.data.ts \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "Accept: text/typescript" \
  http://localhost:3000/api/typed-schemas/v1/typescript
```

Useful filters:

- `?database=Boba` or `?database=1` for one database's semantic layer.
- `?libraryCollections=24,25` for curated Data/Metrics library subcollections.
- `?questionCollections=10,11` for saved questions from normal collections.

Use `libraryCollections` for semantic-layer tables, segments, measures, and metrics. Use `questionCollections` for saved questions. Do not assume library collections contain questions.

Import the schema as `schema`:

```ts
import schema from "../metabase.data";
```

## Default Pattern

Prefer generated schema objects over raw IDs or strings. Extract local constants for the top-level semantic objects used by a component.

```ts
import {
  breakout,
  filter,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

const lifetimeValueMetric = schema.metrics.customerLifetimeValue;
const lifetimeValueTable = schema.tables.customerLifetimeValue;
```

Use `filter(...)` for field and dimension filters. It gives better autocomplete and operator validation than inline objects.
Use `breakout(...)` for breakouts. It gives clearer bucket autocomplete and shorter errors when a non-date dimension is accidentally bucketed.

```ts
const { data } = useMetabaseQuery({
  metric: lifetimeValueMetric,
  filters: [filter(lifetimeValueMetric.dimensions.orders, ">", 0)],
  measures: [lifetimeValueTable.measures.totalLtv],
  breakouts: [
    breakout(lifetimeValueMetric.dimensions.lastOrderedAt, { bucket: "month" }),
  ],
});
```

The older object form still works and is supported:

```ts
filters: [
  {
    dimension: lifetimeValueMetric.dimensions.orders,
    operator: ">",
    value: 0,
  },
];
```

Prefer `filter(...)` unless object form makes a specific advanced case clearer.

## Query Recipes

### Saved Questions

Use the question schema as the generic and pass the generated question ID.

```ts
type Customers = typeof schema.questions.koiBobaAppCustomersTable;

const { data, isLoading, error } = useMetabaseQuery<Customers>({
  questionId: schema.questions.koiBobaAppCustomersTable.id,
});

const customers = data?.rows ?? [];
```

Do not create `useQuestionRows` wrappers or map rows through `toCustomer` just to recover fields. The schema generic gives keyed rows.

### Tables

Table queries use `tableId`, table fields, table segments, and table measures from the same table. Give the table schema as the generic so TypeScript can validate field membership.

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

### Metrics

Metric queries use `metric`, not `metricId`. Metric dimensions come from `metric.dimensions`.

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

Do not pass raw dimension strings like `"created_at"` or `"segment"`. Use the keyed generated dimension object so the SDK can send the generated UUID required by the metric API.

### Metrics With Measures

A metric can be used as the base aggregation and table measures can add extra series in the same query. Use measures from tables mapped by the metric.

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

Do not mix measures from unrelated tables. If TypeScript rejects a measure, choose a measure whose `tableId` is included in the metric's `mappedTableIds`.

## Filters

Use the positional helper for custom filters:

```ts
filter(metric.dimensions.orders, ">", 0);
filter(metric.dimensions.segment, "contains", "delivery");
filter(metric.dimensions.orders, "between", [10, 20]);
filter(metric.dimensions.segment, "not-empty");
```

Operator rules:

- string dimensions: `=`, `!=`, `contains`, `does-not-contain`, `starts-with`, `ends-with`, `is-empty`, `not-empty`, `is-null`, `not-null`
- number dimensions: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `is-null`, `not-null`
- date dimensions: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `time-interval`, `is-null`, `not-null`
- boolean dimensions: `=`, `is-null`, `not-null`

`filter(...)` improves autocomplete, but it does not yet fully validate value types. A date dimension with `">", 0` may still become a runtime database error. Use date values for date dimensions.

Segments are already filters and do not use `filter(...)`:

```ts
filters: [
  schema.tables.orders.segments.completedOrders,
  filter(schema.tables.orders.fields.total, ">", 100),
];
```

## Breakouts

Use the positional helper for breakouts:

```ts
breakout(schema.metrics.revenue.dimensions.createdAt, { bucket: "month" });
breakout(schema.metrics.revenue.dimensions.amount, {
  binning: { strategy: "num-bins", "num-bins": 10 },
});
breakout(schema.metrics.revenue.dimensions.state);
```

Pass breakout options as the second argument. Only date dimensions can use `bucket`. `binning` is also available for breakout options. Non-date dimensions can be used as breakouts without `bucket`.

```ts
breakouts: [
  breakout(schema.metrics.revenue.dimensions.createdAt, { bucket: "month" }),
  breakout(schema.metrics.revenue.dimensions.amount, {
    binning: { strategy: "num-bins", "num-bins": 10 },
  }),
  breakout(schema.metrics.revenue.dimensions.state),
];
```

The older object form still works, but TypeScript can produce long and misleading union errors for invalid buckets. Prefer `breakout(...)` unless object form makes a specific advanced case clearer.

## TypeScript Debugging Loop

When TypeScript errors are complex, do not guess. Run the app typecheck and reduce the error to one of these patterns.

```bash
./node_modules/.bin/tsc --noEmit
```

If the app has a script, use that instead, for example `npm run build` or `npm run typecheck`. Fix one query error at a time.

### Error Patterns

**No overload matches `filter(...)`**

Typical meaning: the operator does not match the dimension type.

Example diagnostic:

```text
Argument of type '"contains"' is not assignable to parameter of type '"=" | "!=" | ">" | ">=" | "<" | "<="'.
```

Fix: use a numeric operator for number dimensions, or choose a string dimension for string operators.

```ts
filter(metric.dimensions.orders, ">", 0);
filter(metric.dimensions.segment, "contains", "delivery");
```

**`bucket` error or dimension name mismatch in `breakouts`**

Typical meaning: a non-date dimension is using a temporal bucket, or the dimension came from the wrong metric/table.

Fix: remove `bucket` for non-date dimensions, or use a date dimension.

```ts
breakouts: [breakout(metric.dimensions.segment)];
breakouts: [breakout(metric.dimensions.createdAt, { bucket: "month" })];
```

If the error is very long and mentions `dimension.name`, rewrite the breakout with `breakout(...)` first. Invalid bucket usage then points directly at the second argument, for example `"week-of-year"` not assignable to `never`.

**`dimension.id` or `dimension.name` is incompatible**

Typical meaning: the filter dimension is from a different metric or table than the query.

Fix metric filters by using dimensions from the same metric object:

```ts
const metric = schema.metrics.customerLifetimeValue;

filters: [filter(metric.dimensions.orders, ">", 0)];
```

Fix table filters by giving `useMetabaseQuery` the table generic and using fields from that same table:

```ts
const table = schema.tables.customerLifetimeValue;
type Table = typeof table;

useMetabaseQuery<Table>({
  tableId: table.id,
  filters: [filter(table.fields.orders, ">", 0)],
});
```

**Segment or measure from the wrong table**

Typical meaning: the segment or measure's `tableId` does not match the queried table, or is not in the metric's `mappedTableIds`.

Fix: choose segments/measures from the table being queried, or from a metric-mapped table.

**Runtime SQL error like `timestamp with time zone > integer`**

Typical meaning: the dimension type and value are incompatible even if TypeScript accepted the operator.

Fix: inspect the schema field's `jsType` and use a matching value, e.g. date values for date dimensions, numbers for number dimensions, strings for string dimensions.

## Query Result Shape and Charts

Always inspect the returned `columns` before mapping low-level `rawRows`.

- Prefer keyed `data.rows` for saved questions and simple table or metric results.
- Use `rawRows` only when the visualization needs positional access, such as multiple aggregation series.
- For aggregation results, Metabase may name columns by aggregation aliases like `count`, `sum`, or `avg`. Match columns by metadata when needed, then use a clear positional fallback only for a known query shape.
- Metric-plus-measure queries commonly return `[breakout, metric aggregation, measure aggregation]`.
- Grouped queries can include a `null` breakout bucket. Decide deliberately whether to render it as `"Unknown"` or filter it out. Do not accidentally treat it as the latest time bucket.
- Multi-series charts with different units or magnitudes should use separate y-axes or per-series normalization.
- If an SVG chart uses `preserveAspectRatio="none"`, SVG circles will stretch with the chart. Render dots as CSS circles over the SVG, or use a non-stretched SVG coordinate system.

## Presentation Layer

The React app may group, sort, format, and derive display-only values from `data.rows`, but the underlying semantic objects still come only from `schema`.

Good presentation transforms:

- Group rows for summaries, such as revenue by franchise or customers by tier.
- Sort and slice rows for ranked lists.
- Format values by domain: currency to at most 2 decimals, counts as whole numbers, dates as short readable labels.
- Choose chart types from actual data shape: trends need multiple ordered buckets, distributions need multiple categories, and scalar values should stay scalar.

If no curated schema entry supports the intended UI, leave an empty/error state or ask for the semantic layer to be curated. Do not invent mock data or create new Metabase questions from the app-building step.

## Common Mistakes

- Searching the Metabase instance or creating saved questions while building the UI. The semantic layer must already be curated.
- Importing older split query hooks for new semantic-schema apps. Use `useMetabaseQuery`.
- Using `metricId` for new metric queries. Use `metric: schema.metrics.someMetric`.
- Copying numeric IDs into constants. Use generated `.id` values inline for `questionId` and `tableId`, and generated objects for metrics.
- Passing raw strings for metric dimensions or table fields.
- Adding local field or dimension lookup helpers instead of using keyed generated schema objects.
- Mixing fields, dimensions, segments, or measures from the wrong table or metric.
- Assuming `filter(...)` is required. Object-form filters still work, but `filter(...)` is better for autocomplete.
- Assuming `filter(...)` validates value types. It primarily validates operator and dimension shape.
- Using object-form breakouts by default. `breakout(...)` gives shorter bucket errors and better autocomplete.
- Letting a `null` breakout bucket become the last point in a time-series chart.
- Plotting different-unit series on one shared scale when the intended comparison needs separate axes or normalized series.
- Showing raw floating point values in user-facing UI. Format numbers according to their domain.
- Keeping mock data or placeholder analytics when a curated schema entry can power the view.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating a nested `MetabaseProvider` per component instead of sharing one provider at the app boundary.
