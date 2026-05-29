---
name: metabase-semantic-schema-data-apps
description: Use when building React data apps from curated Metabase typed schema exports with Embedding SDK data hooks.
---

# Metabase Data Hook Custom Visualizations

## Core Rule

Keep the semantic layer and presentation layer separate.

All Metabase instance context must come from the curated generated schema file, usually `src/metabase.data.ts`. Do not discover data, create questions, or edit the semantic layer while building the React UI. Questions and metrics in the schema are curated upstream.

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
   - Import it as `schema` in app code:

```ts
import schema from "../metabase.data";
```

2. Choose semantic objects from the schema.
   - Use `schema.questions.someQuestion` for saved question results.
   - Use `schema.metrics.someMetric` for metric results.
   - Inspect `columns`, metric `dimensions`, names, descriptions, and `jsType` to design the UI.
   - Do not copy numeric IDs into constants. For question queries, pass the generated schema object's `.id` inline.
   - For each hook call, define a local type alias from the exact schema object, for example `type Customers = typeof schema.questions.koiBobaAppCustomersTable;`.

3. Render with SDK data hooks.
   - Wrap the app once in `MetabaseProvider`.
   - Call `useQuestionQuery<SomeQuestion>(schema.questions.someQuestion.id)` for question-backed views.
   - Call `useMetricQuery<SomeMetric>(schema.metrics.someMetric, { filters, breakouts })` for metric-backed views.
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

## useQuestionQuery

`useQuestionQuery<QuestionType>(schema.questions.someQuestion.id)` returns keyed rows inferred from the schema. The schema object is the static type source; its `.id` is the runtime input:

```ts
import { useQuestionQuery } from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

type Customers = typeof schema.questions.koiBobaAppCustomersTable;

const { data, isLoading, error } = useQuestionQuery<Customers>(
  schema.questions.koiBobaAppCustomersTable.id,
);

const customers = data?.rows ?? [];
```

Rows are objects when a generated schema type is provided as the generic. Use `rawRows` only when positional arrays are needed for debugging or low-level rendering.

Do not write a wrapper like `useQuestionRows`, and do not map every row through `toOrder` or `toCustomer` just to recover object fields. The schema object is the type source, and `.id` is the runtime argument.

Preferred:

```ts
type Customers = typeof schema.questions.koiBobaAppCustomersTable;

const { data } = useQuestionQuery<Customers>(
  schema.questions.koiBobaAppCustomersTable.id,
);

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

## useMetricQuery

`useMetricQuery` maps a metric schema to the metric dataset API definition, including `expression`, per-instance `filters`, and `projections` for breakouts.

```ts
import { useMetricQuery } from "@metabase/embedding-sdk-react";
import schema from "../metabase.data";

type CustomerLifetimeValue = typeof schema.metrics.customerLifetimeValue;

const { data } = useMetricQuery<CustomerLifetimeValue>(
  schema.metrics.customerLifetimeValue,
  {
    filters: [{ dimension: "orders", operator: ">", value: 0 }],
    breakouts: [{ dimension: "segment" }],
  },
);

const customerSegments = (data?.rows ?? []).map((row) => ({
  segment: row.segment,
  count: row.count,
}));
```

Metric `dimension` names should come from the metric schema's `dimensions` array.

## Debugging Checklist

When the UI shows an empty state such as "No orders found":

1. Log the hook state: schema object `id`, `isLoading`, `error`, `Boolean(data)`.
2. Log `data?.columns.map(c => c.name)` and `data?.rows.length`.
3. Log the first row object and `data?.rawRows[0]` if positional debugging is needed.
4. Confirm the component is rendered under `MetabaseProvider`.
5. Confirm the generated schema entry has the expected `id`, `columns`, and metric `dimensions`.
6. If the schema is stale, ask for an API key and regenerate `src/metabase.data.ts`.

## Common Mistakes

- Searching the Metabase instance or creating saved questions while building the UI. The semantic layer must already be curated.
- Copying numeric IDs into constants. Use `schema.questions.someQuestion.id` inline for question queries.
- Recreating a `useQuestionRows` wrapper. Use `useQuestionQuery<SomeQuestion>(schema.questions.someQuestion.id)` directly.
- Mapping rows through `toX` adapter functions just to regain typed fields. The hook already returns typed row objects when given the generated schema type.
- Hard-coding column indexes when keyed rows are available.
- Inventing fields that are not present in `schema.questions.*.columns` or `schema.metrics.*.dimensions`.
- Forcing a chart type without checking whether the result has enough rows or categories to support it.
- Showing raw floating point values in user-facing UI. Format numbers according to their domain.
- Keeping mock data or placeholder analytics when a curated schema entry can power the view.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating a nested `MetabaseProvider` per component instead of sharing one provider at the app boundary.
