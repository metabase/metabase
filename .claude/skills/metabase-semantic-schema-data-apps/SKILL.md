---
name: metabase-semantic-schema-data-apps
description: Use when building React data apps from curated Metabase typed schema exports with the Embedding SDK query hook.
---

# Metabase Semantic Schema Data Apps

## Core Rule

Keep the semantic layer and presentation layer separate.

All Metabase instance context must come from the curated generated schema file, usually `src/metabase.data.ts`. Do not discover data, create questions, create metrics, create tables, or edit the semantic layer while building the React UI. Questions, tables, metrics, segments, and measures in the schema are curated upstream.

## Workflow

1. Ensure the app has a fresh schema export.
   - If `src/metabase.data.ts` is missing or stale, ask the user for a Metabase API key.
   - Generate the schema with e.g.:

```bash
curl \
  -o src/metabase.data.ts
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "Accept: text/typescript" \
  http://localhost:3000/api/typed-schemas/v1/typescript
```

- Response is saved as `src/metabase.data.ts`.
- To reduce schema size for apps backed by one database, add `?database=<DATABASE_NAME>`, for example `?database=Boba`.
- Import it as `schema` in app code:

```ts
import schema from "../metabase.data";
```

2. Choose semantic objects from the schema.

   - Use `schema.questions.someQuestion` for saved question results.
   - Use `schema.tables.someTable` for table-backed exploration with curated segments and measures.
   - Use `schema.metrics.someMetric` for metric results.
   - Inspect `columns`, table `fields`, table `segments`, table `measures`, metric `dimensions`, names, descriptions, and `jsType` to design the UI.
   - Reference table fields and metric dimensions through keyed generated schema objects, such as `schema.tables.orders.fields.createdAt` or `schema.metrics.revenue.dimensions.createdAt`.
   - Do not copy numeric IDs into constants. Pass generated schema object `.id` values inline.
   - For each hook call, define a local type alias from the exact schema object, for example `type Customers = typeof schema.questions.koiBobaAppCustomersTable;`.

3. Render with the SDK query hook.
   - Wrap the app once in `MetabaseProvider`.
   - Use `useMetabaseQuery` for schema-backed data fetching.
   - Do not use the older split hooks for new semantic-schema data apps.
   - Call `useMetabaseQuery<SomeQuestion>({ questionId: schema.questions.someQuestion.id })` for question-backed views.
   - Call `useMetabaseQuery<SomeTable>({ tableId: schema.tables.someTable.id, filters, measures, breakouts })` for table-backed views.
   - Call `useMetabaseQuery<SomeMetric, Schema>({ metricId: schema.metrics.someMetric.id, filters, breakouts })` for metric-backed views when metric filters use table segments.
   - For metric-backed views that add curated measures as extra series, pass table measures in `measures` and use table fields for `breakouts`.
   - Handle `isLoading`, `error`, and empty data explicitly.
   - Use `data.rows` directly. Only do presentation normalization inline when the UI needs labels, badges, numeric coercion, or null fallbacks.
   - Build visuals from actual result shape and cardinality. If a result has one row, one bucket, or one category, prefer a KPI, ranked list, table, or another honest summary over forcing a trend or distribution chart.

## Presentation Layer

The React app may group, sort, format, and derive display-only values from `data.rows`, but the underlying semantic objects still come only from `schema`.

Good presentation transforms:

- Group rows for visual summaries, such as revenue by franchise or customers by tier.
- Sort and slice rows for ranked lists, such as top menu items.
- Format values by domain: currency to at most 2 decimals, counts as whole numbers, dates as short readable labels.
- Choose chart types from actual data shape: trends need multiple ordered buckets, distributions need multiple categories, and scalar values should stay scalar.

If no curated schema entry supports the intended UI, leave the UI empty/error state or ask for the semantic layer to be curated. Do not invent mock data or create new Metabase questions from the app-building step.

## Query Result Shape and Charts

Always inspect the returned `columns` before mapping low-level `rawRows`.

- Prefer keyed `data.rows` for saved questions and simple table or metric results.
- Use `rawRows` only when the visualization needs positional access, such as multiple aggregation series.
- For aggregation results, Metabase may name columns by aggregation aliases like `count`, `sum`, or `avg`, even when the curated measure is named differently. Match columns by `field_ref`, `name`, `display_name`, and `displayName`, then use a clear positional fallback only for a known query shape.
- Metric-plus-measure queries commonly return `[breakout, metric aggregation, measure aggregation]`.
- Grouped queries can include a `null` breakout bucket. Decide deliberately whether to render it as "Unknown" or filter it out. Do not accidentally treat it as the latest time bucket.
- Multi-series charts with different units or magnitudes should use separate y-axes or per-series normalization. A single shared scale can flatten the smaller series even when the query is correct.
- If an SVG chart uses `preserveAspectRatio="none"`, SVG circles will stretch with the chart. Render dots as CSS circles over the SVG, or use a non-stretched SVG coordinate system.

## useMetabaseQuery

`useMetabaseQuery` returns keyed rows inferred from the schema. The schema object is the static type source; `.id` is the runtime input.

### Saved Questions

```ts
import { useMetabaseQuery } from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

type Customers = typeof schema.questions.koiBobaAppCustomersTable;

const { data, isLoading, error } = useMetabaseQuery<Customers>({
  questionId: schema.questions.koiBobaAppCustomersTable.id,
});

const customers = data?.rows ?? [];
```

Rows are objects when a generated schema type is provided as the generic. Use `rawRows` only when positional arrays are needed for debugging or low-level rendering.

Do not write a wrapper like `useQuestionRows`, and do not map every row through `toOrder` or `toCustomer` just to recover object fields. The schema object is the type source, and `.id` is the runtime argument.

Preferred:

```ts
type Customers = typeof schema.questions.koiBobaAppCustomersTable;

const { data } = useMetabaseQuery<Customers>({
  questionId: schema.questions.koiBobaAppCustomersTable.id,
});

const customers = data?.rows ?? [];
```

Avoid:

```ts
function toCustomer(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
  };
}

const customers = rows.map(toCustomer);
```

### Tables

Table queries can use curated table segments as `filters`, curated table measures as `measures`, and table fields as `breakouts`.

```ts
import { useMetabaseQuery } from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

type Orders = typeof schema.tables.orders;

const { data } = useMetabaseQuery<Orders>({
  tableId: schema.tables.orders.id,
  filters: [schema.tables.orders.segments.completedOrders],
  measures: [schema.tables.orders.measures.revenue],
  breakouts: [
    {
      dimension: schema.tables.orders.fields.createdAt,
      bucket: "month",
    },
  ],
});
```

Use segments and measures from the same table as `tableId`. Do not mix segments or measures from another table.

### Metrics

Metric-only queries map to the metric dataset API definition, including `expression`, per-instance `filters`, and `projections` for breakouts.

```ts
import { useMetabaseQuery } from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

type Schema = typeof schema;
type CustomerLifetimeValue = typeof schema.metrics.customerLifetimeValue;

const { data } = useMetabaseQuery<CustomerLifetimeValue, Schema>({
  metricId: schema.metrics.customerLifetimeValue.id,
  filters: [schema.tables.customers.segments.hasOrders],
  breakouts: [
    {
      dimension: schema.metrics.customerLifetimeValue.dimensions.createdAt,
      bucket: "month",
    },
  ],
});

const customerSegments = (data?.rows ?? []).map((row) => ({
  segment: row.segment,
  count: row.count,
}));
```

Metric `dimension` values should come from the metric schema's keyed `dimensions` object. Segment filters should come from tables listed in the metric's `mappedTableIds`.

Preferred:

```ts
breakouts: [
  {
    dimension: schema.metrics.customerLifetimeValue.dimensions.segment,
  },
];
```

Avoid:

```ts
breakouts: [{ dimension: "segment" }];
```

Do not add local lookup helpers like `getMetricDimension(metric, "segment")` or `getTableField(table, "created_at")`. If a field or dimension is needed in app code, use the generated keyed schema object directly.

Metric queries can also add curated table measures as additional aggregations in the same query stage. In that case, use the metric as the base aggregation, use table measures as extra aggregations, and use fields from the measure's table for breakouts:

```ts
type Schema = typeof schema;
type CustomerLifetimeValue = typeof schema.metrics.customerLifetimeValue;

const lifetimeValueTable = schema.tables.customerLifetimeValue;
const lifetimeValueMetric = schema.metrics.customerLifetimeValue;

const { data } = useMetabaseQuery<CustomerLifetimeValue, Schema>({
  metricId: lifetimeValueMetric.id,
  measures: [lifetimeValueTable.measures.totalLtv],
  breakouts: [
    {
      dimension: lifetimeValueTable.fields.lastOrderedAt,
      bucket: "month",
    },
  ],
});
```

Use measures from one compatible table. Do not mix measures from unrelated tables in a single metric query.

## Debugging Checklist

When the UI shows an empty state such as "No orders found":

1. Log the hook state: schema object `id`, `isLoading`, `error`, `Boolean(data)`.
2. Log `data?.columns.map(c => c.name)` and `data?.rows.length`.
3. Log the full first column object, first row object, and `data?.rawRows[0]` if positional debugging is needed.
4. Confirm the component is rendered under `MetabaseProvider`.
5. Confirm the generated schema entry has the expected `id`, `columns`, keyed table `fields`, table `segments`, table `measures`, and keyed metric `dimensions`.
6. If the schema is stale, ask for an API key and regenerate `src/metabase.data.ts`.

## Common Mistakes

- Searching the Metabase instance or creating saved questions while building the UI. The semantic layer must already be curated.
- Importing the older split query hooks for new semantic-schema apps. Use `useMetabaseQuery`.
- Copying numeric IDs into constants. Use generated `.id` values inline in `useMetabaseQuery`.
- Recreating a `useQuestionRows` wrapper. Use `useMetabaseQuery<SomeQuestion>({ questionId: schema.questions.someQuestion.id })` directly.
- Mapping rows through `toX` adapter functions just to regain typed fields. The hook already returns typed row objects when given the generated schema type.
- Hard-coding column indexes when keyed rows are available.
- Inventing fields that are not present in `schema.questions.*.columns`, `schema.tables.*.fields`, or `schema.metrics.*.dimensions`.
- Passing raw strings for metric dimensions. Use `schema.metrics.someMetric.dimensions.someDimension` so the SDK can send the generated dimension id expected by Metabase.
- Passing raw strings for table fields. Use `schema.tables.someTable.fields.someField` so the SDK can send the generated field id expected by Metabase.
- Adding local field or dimension lookup helpers in React components instead of using the keyed generated schema objects.
- Mixing segments or measures from a different table than the queried `tableId`.
- Mixing measures from multiple tables in one metric query.
- Assuming measure result columns are named after the curated measure. Check returned aggregation column metadata; the API may use names like `sum`.
- Letting a `null` breakout bucket become the last point in a time-series chart.
- Plotting different-unit series on one shared scale when the intended comparison needs separate axes or normalized series.
- Drawing SVG point markers inside a stretched SVG and accidentally turning circles into ovals.
- Forcing a chart type without checking whether the result has enough rows or categories to support it.
- Showing raw floating point values in user-facing UI. Format numbers according to their domain.
- Keeping mock data or placeholder analytics when a curated schema entry can power the view.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating a nested `MetabaseProvider` per component instead of sharing one provider at the app boundary.
