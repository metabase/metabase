---
name: metabase-data-app-semantic-layer
description: Use when building, creating, or editing data apps that should query Metabase tables and metrics through generated schema files like metabase.data.ts or *.metabase.data.ts.
---

# Metabase Data App Semantic Layer

## Core Rules

Keep the semantic layer and presentation layer separate.

- All Metabase context must come from the generated schema file, usually `src/metabase.data.ts` or `src/*.metabase.data.ts`.
- Do not discover data through MCP tools, create Metabase content, create tables, or edit the semantic layer while building the React UI.
- Import data app query helpers from `@metabase/embedding-sdk-react/data-app`.
- Prefer generated schema objects over raw IDs or strings. Extract local constants for top-level table objects.
- Never hand-write `DatasetQuery`/MBQL objects in app code. Do not pass inline query objects like `{ type: "query", query: { "source-table": table.id } }`, raw `source-table` clauses, raw field IDs, bare table IDs, or metric IDs to SDK components, `useMetabaseQuery`, or `useMetabaseQueryObject`. Prefer generated table and metric schema objects; for simple table-source queries, an explicit source reference like `{ type: "table", id: table.id }` is also valid.
- Build queries with `source: schema.tables.<name>` or `source: schema.questions.<name>`, generated `fields`, generated `segments`, generated `measures`, generated metrics in `aggregations`, generated metric `dimensions`, `filter(...)`, `breakout(...)`, `orderBy(...)`, and `aggregations` helpers such as `aggregations.count()` and `aggregations.sum(...)`. Do not use `source: schema.metrics.<name>`; metrics are aggregation expressions, not query sources.
- Prefer semantically rich table queries over shallow table dumps. Use curated table measures, segments, filters, and breakouts when they make the generated app more useful.
- Prefer semantic-layer definitions over React-side inference. If the schema has a segment or measure for a concept, use it instead of recreating the concept from raw rows.
- Filter UI must default to showing data. Empty controls, "All" options, and incomplete custom ranges should produce no filter instead of blocking queries or showing a blank dashboard.
- Do not hardcode categorical filter option values. A generated schema field only proves the field exists, not which values exist; query options from Metabase at runtime using the same generated schema field that the filter applies.
- Dashboard-level filters should visibly affect every compatible card, table, KPI, and trend. If a filter can only apply to one query, make that scope obvious in the UI; do not show duplicate or no-op date controls.
- Entity filters, where the stored value is an id/key and the UI shows a label, must use a single searchable combobox. Click/focus must open the option list immediately, before typing. Query options at runtime, search labels, and store the raw value. Never render entity filters as `<select>`; plain selects are only for short closed enums explicitly provided by the user.
- Do not use native `<input type="date">` for data-app filter bars. Its placeholder and calendar popover are browser-controlled, often show `mm/dd/yyyy`, and cannot be reliably themed. If the repo already has a date picker component or component library, use that. Otherwise install `react-datepicker` for custom date selection.
- Date bars must include Custom last by default: duration presets, All time, then Custom. Omit Custom only when the user explicitly asks for fixed presets only or no date range control. Date pickers must receive `Date | null`, never `new Date("")` or another invalid date for incomplete ranges; type strict callback parameters explicitly, such as `onChange={(date: Date | null) => ...}`.
- Never invent aggregation or measure objects such as `{ name: "count" }` or `{ name: "sum", field: ... }`. Use generated table measures or exported aggregation helpers.
- Only render values returned by Metabase or deterministic transforms of returned values. Do not invent KPI values, trends, labels, statuses, ratings, timestamps, rankings, insights, segments, or chart series.
- Do not custom-render ambiguous business fields such as `margin`, `rate`, `score`, `percent`, `health`, `risk`, or `efficiency`. Do not add `%`, multiply by 100, color-code, or render stars unless semantic-layer units explicitly support it; use an SDK table/chart, omit the field, or ask for curation.
- Visualization data must come from Metabase through `useMetabaseQuery` or `useMetabaseQueryObject` with `InteractiveQuestion`/`StaticQuestion`. Do not hardcode chart-ready arrays, sample data, demo values, or schema-shaped mock values.
- When wrapping an SDK-rendered question in a card or section that already has its own title, pass `title={false}` to the SDK question component to avoid duplicate generated question titles.
- `useMetabaseQueryObject(...)` returns `{ query, error, isLoading }`. Pass only the `query` property as `card={{ query }}` to `InteractiveQuestion` or `StaticQuestion`; never pass the whole hook result as `card.query`.
- `useMetabaseQuery().rows` are keyed objects, not tuple arrays. Never read `row[0]` / `row[1]`, and never silence this with `as unknown as [string, number][]`, `DisplayRow`, or another tuple cast. If TypeScript says property `0` does not exist, it is catching a real bug. For typed `data.rows`, use literal keys such as `row.count` or generated field names such as `row[ordersTable.fields.createdAt.name]`. Use `data.columns` with `rawRows` or after explicitly narrowing a key; do not index typed rows with arbitrary `string` values from `data.columns`.
- Do not cast query objects to `Parameters<typeof useMetabaseQuery>[0]`. That erases the generated table/metric validation. Use `useMetabaseQuery<typeof table>(...)`, or type a reusable query object with `satisfies MetabaseQueryOptions<typeof table>`.
- Do not build shared filter arrays with `ReturnType<typeof filter>[]` or `push(...)`; this can collapse overload inference. Pass raw filter state between components and build each query's `filters: [...]` inline with spreads.
- Do not include `fields` in queries with `aggregations` and `breakouts`; breakouts determine grouped result columns. Use `fields` only for row-selection queries.
- Before rendering a field, verify it exists in the generated schema object and is returned by the query. Do not guess table keys, field keys, or column names from the Metabase API, business intuition, or old mock data; only use entries actually emitted in `src/metabase.data.ts`.
- Avoid unsupported freshness or operational claims such as "real-time", "live", "understaffed", or "risk" unless the returned data or curated semantic-layer definition supports them.
- Before claiming the work is done or preparing a final handoff, run a TypeScript type-only check and report the command/result. If the check fails, fix the type errors before any final summary.

## Generate Schema

If the schema file already exists, use it. If it is missing or stale, treat schema generation as semantic-layer curation for this data app, not a mechanical export.

Before generating, make sure the user has explicitly chosen the library scope the app needs:

- `includeDataLibrary=true` for the whole `Library / Data` tree.
- `includeMetricLibrary=true` for the whole `Library / metrics` tree.
- `libraryCollections=<id-or-entity-id>[,<id-or-entity-id>]` for specific Data or metrics library subcollections.
- `questionCollections=<id-or-entity-id>[,<id-or-entity-id>]` for specific normal collections that contain saved questions and models.
- `database=<name-or-id>` when the app should use tables from one database.

Use `questionCollections` when the app needs generated `schema.questions.*` or `schema.models.*`. It can be combined with `libraryCollections`, `includeDataLibrary`, or `includeMetricLibrary` so one schema can include selected tables/metrics plus selected saved questions/models.

If the user did not already choose a library scope, stop and ask what they want. Warn before exporting the whole instance: including everything is noisy, bloats context, and makes agents more likely to pick irrelevant entities.

The Metabase URL and API key live in the **repo-root** `.env.local` as
`DATA_APP_MB_URL` and `DATA_APP_MB_API_KEY` (one file per repo, usually two levels up
from the app dir, not in the app dir). The command below `source`s that file so
the shell substitutes the values straight into `curl` — you never read, extract,
or handle the credentials yourself.

> **Never ask the user to paste the API key into the chat, and never `cat` /
> `echo` `.env.local`** — it's git-ignored and may hold other secrets, so its
> contents must stay out of the conversation. `source` it so the shell uses the
> values without exposing them. If `$DATA_APP_MB_API_KEY` or `$DATA_APP_MB_URL` is empty
> or still set to the default `mb_replace_me` placeholder after sourcing, ask
> the user to add real values themselves, then continue.

Source the credentials from the repo-root `.env.local` and generate the scoped
schema:

```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$ROOT" ]; then
  echo "Not inside the connected git repo — cd into it first." >&2
  exit 1
fi

(
  source "$ROOT/.env.local" 2>/dev/null
  # Fail early (before curl) if either var is missing or placeholder-only.
  if [ -z "$DATA_APP_MB_URL" ] || [ "$DATA_APP_MB_URL" = "mb_replace_me" ] ||
     [ -z "$DATA_APP_MB_API_KEY" ] || [ "$DATA_APP_MB_API_KEY" = "mb_replace_me" ]; then
    echo "Set real DATA_APP_MB_URL / DATA_APP_MB_API_KEY in repo-root .env.local" >&2
    exit 1
  fi
  curl \
    -o src/metabase.data.ts \
    -H "x-api-key: $DATA_APP_MB_API_KEY" \
    -H "Accept: text/typescript" \
    "$DATA_APP_MB_URL/api/typed-schemas/v1/typescript?includeDataLibrary=true&includeMetricLibrary=true"
)
```

When the app needs saved questions or models, include `questionCollections=<id-or-entity-id>[,<id-or-entity-id>]` in the typed-schema URL.

If schema generation fails while building a selected saved question, model, or model action, do not hide, paraphrase away, or retry past the error. Surface the typed-schema error to the user, including the failing `card-id` / `card-name` / `card-type`, `model-id` / `model-name`, dropped action ids, and message when present. This usually means a selected model/question/action was readable enough to select, but its details could not be built, often because its source table, source card, or action details are not published, accessible, valid, or resolvable in the fetch context. The schema would otherwise omit the entire `schema.models.<model>` or `schema.questions.<question>` entry, or return a model whose `actions` map silently omits an action, so the user needs to curate or publish the missing dependency before regenerating.

## Standard pattern

```ts
import {
  aggregations,
  breakout,
  filter,
  orderBy,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";
import schema from "../metabase.data";

const ordersTable = schema.tables.orders;

const { data, isLoading, error } = useMetabaseQuery({
  source: ordersTable,
  filters: [
    ordersTable.segments.completed,
    filter(ordersTable.fields.status, "=", "paid"),
  ],
  aggregations: [aggregations.sum(ordersTable.fields.amount)],
  breakouts: [breakout(ordersTable.fields.createdAt, { unit: "month" })],
  orderBys: [orderBy(ordersTable.fields.createdAt, "desc", { unit: "month" })],
  limit: 100,
});
```

For direct row access, prefer letting `useMetabaseQuery(...)` infer the query shape from the inline query object. If you need a reusable query object and table ownership checks, type the object with `satisfies MetabaseQueryOptions<OrdersTable>`, then pass it to `useMetabaseQuery(query)`. Avoid forcing the hook generic on selected-field queries when you need precise row keys from `data.rows`.

Use keyed schema objects:

- Tables: `source: schema.tables.<table>`
- metrics: `schema.metrics.<metric>` inside `aggregations`
- Saved questions: `source: schema.questions.<question>`
- Fields: `schema.tables.<table>.fields.<field>`
- Segments: `schema.tables.<table>.segments.<segment>`
- Measures: `schema.tables.<table>.measures.<measure>`
- metric dimensions: `schema.metrics.<metric>.dimensions.<group>.<dimension>`

Do not pass raw dimension strings like `"created_at"` or `"segment"`.

## Table query recipes

For a table query, pass the generated table object as `source`:

```ts
const recordsTable = schema.tables.records;

const { data } = useMetabaseQuery({
  source: recordsTable,
  fields: [recordsTable.fields.id, recordsTable.fields.status],
});
```

For grouped table summaries, include at least one aggregation:

```ts
useMetabaseQuery({
  source: recordsTable,
  filters: [
    recordsTable.segments.activeRecords,
    filter(recordsTable.fields.amount, ">", 100),
  ],
  aggregations: [recordsTable.measures.totalAmount],
  breakouts: [breakout(recordsTable.fields.createdAt, { unit: "month" })],
  orderBys: [orderBy(recordsTable.fields.createdAt, "desc", { unit: "month" })],
});
```

For basic aggregations without a curated measure, use the `aggregations` helpers:

```ts
useMetabaseQuery({
  source: recordsTable,
  aggregations: [
    aggregations.count(),
    aggregations.sum(recordsTable.fields.amount),
  ],
  breakouts: [breakout(recordsTable.fields.category)],
});
```

When using the same helper more than once, Metabase may return numbered runtime keys such as `sum`, `sum_2`, and `sum_3`. TypeScript only models the base helper key today. For custom KPI code that intentionally uses repeated same-kind aggregations, read through `data.columns` or cast the row to `Record<string, unknown>` before accessing numbered keys. Prefer curated measures or separate queries when that is clearer.

Table fields, segments, measures, filters, breakouts, and orderBys must come from the queried table. For reusable query objects, use `satisfies MetabaseQueryOptions<RecordsTable>` so TypeScript can validate the query while preserving precise row keys.

## metric aggregation recipes

For a metric-backed query, pass the generated table object as `source` and the generated metric object in `aggregations`:

```ts
const ordersTable = schema.tables.orders;
const revenueMetric = schema.metrics.revenue;

const { data } = useMetabaseQuery({
  source: ordersTable,
  aggregations: [revenueMetric],
});
```

Use generated metric dimensions for filters and breakouts in queries that aggregate the owning metric. Dimensions from the metric's source table work directly. Dimensions from related tables also work when the generated field includes `sourceFieldId`; prefer those related-table dimensions for readable labels instead of grouping by raw foreign key IDs:

```ts
useMetabaseQuery({
  source: ordersTable,
  aggregations: [revenueMetric],
  filters: [filter(revenueMetric.dimensions.orders.status, "=", "paid")],
  breakouts: [
    breakout(revenueMetric.dimensions.orders.createdAt, { unit: "month" }),
    breakout(revenueMetric.dimensions.franchises.name),
  ],
  orderBys: [
    orderBy(revenueMetric.dimensions.orders.createdAt, "desc", {
      unit: "month",
    }),
  ],
});

// Prefer readable related-table dimensions when available.
breakout(revenueMetric.dimensions.franchises.name);

// Avoid raw FK IDs when the related-table dimension exists.
breakout(revenueMetric.dimensions.orders.franchiseId);
```

Queries backed by metrics can include helper aggregations over generated metric dimensions. They can also use compatible saved Segments and Measures from the table source when the generated schema exposes them:

```ts
useMetabaseQuery({
  source: ordersTable,
  filters: [schema.tables.orders.segments.completed],
  aggregations: [
    revenueMetric,
    schema.tables.orders.measures.totalRevenue,
    aggregations.sum(revenueMetric.dimensions.orders.amount),
  ],
  breakouts: [breakout(revenueMetric.dimensions.orders.status)],
});
```

A metric aggregation must belong to the table source. Do not use source-card metrics in table-source queries. Generated metric dimensions are scoped to their owning metric: if a query uses `revenueMetric.dimensions.*` in filters, helper aggregations, breakouts, or orderBys, it must also include `revenueMetric` in `aggregations`. Do not use metric dimensions as standalone table fields for unrelated `count()` or table-measure queries. Generated metric dimensions must also resolve to the table source. For reusable query objects, use `satisfies MetabaseQueryOptions<typeof ordersTable>` so TypeScript can validate the query while preserving precise row keys.

## Saved question query recipes

For a saved question query, pass the generated question object as `source`:

```ts
const ordersQuestion = schema.questions.ordersQuestion;

const { data } = useMetabaseQuery({
  source: ordersQuestion,
});
```

Saved question queries only support `source` and `enabled` today. Do not add `fields`, `filters`, helper aggregations, breakouts, orderBys, or limits to `source: schema.questions.<question>` queries yet; use table-source queries, including metric aggregations, when the app needs post-source query clauses.

SQL parameters stay on the existing `questionId` query path. Do not pass SQL parameter values through `source: schema.questions.<question>`.

## SDK-rendered views

Table fields, segments, measure aggregations, and metric aggregations must come from the queried table. Generated metric dimensions used in filters, helper aggregations, breakouts, and orderBys must resolve to the queried table and belong to a metric included in the same query's `aggregations`.
When table queries use `fields`, `segments`, `aggregations`, `breakouts`, or `orderBys`, prefer inline inference or a reusable query object with `satisfies MetabaseQueryOptions<typeof recordsTable>` so TypeScript can validate the query without losing precise result-row keys.

## Interactive Metabase Views

Use Metabase's SDK `InteractiveQuestion` or `StaticQuestion` by default when the UI can be expressed as a normal Metabase question visualization. Build a semantic query with `useMetabaseQueryObject`, then pass it through the SDK question component's `card` prop.

`useMetabaseQueryObject` supports generated table queries, including metric aggregations. Use `useMetabaseQuery` when custom React needs direct row data; use `useMetabaseQueryObject` when Metabase should render or manage the visualization. Do not pass generics to `useMetabaseQueryObject`; it returns `{ query, error, isLoading }`, not query result rows.

The examples below use `return null` for minimal loading and error handling. In a real app, render the app's existing loading or error UI there. Passing `card={{ query }}` is safe while `query` is `null`; do not pass the full `{ query, error, isLoading }` hook result as `card.query`.

When wrapping `useMetabaseQueryObject` in a reusable chart/card component, destructure and render `error`; do not read only `{ query }`, because query-construction failures otherwise look like endless loading. Calling the hook inside that child component is valid React. Do not call hooks directly inside loops, conditions, or callbacks in the parent component.

Wrong/right pattern:

```tsx
const trendQuery = useMetabaseQueryObject(querySpec);
<InteractiveQuestion card={{ query: trendQuery }} />; // wrong

const { query: trendQuery } = useMetabaseQueryObject(querySpec);
<InteractiveQuestion card={{ query: trendQuery }} />; // right
```

Hook typing:

- `useMetabaseQuery(...)` infers typed row data from the generated `source` and query object. For reusable query objects, use `satisfies MetabaseQueryOptions<...>` on the object instead of forcing the hook generic.
- `useMetabaseQueryObject(...)` accepts no generic and returns `{ query, error, isLoading }`. Pass the `query` property to `card={{ query }}`.
- Do not use `as Parameters<typeof useMetabaseQuery>[0]` to quiet query typing errors. It hides invalid table fields, metric aggregations, and breakouts. Prefer `useMetabaseQuery<typeof table>(query)` or `const query = { ... } satisfies MetabaseQueryOptions<typeof table>`.

The basic prop contract is:

- Generated table query, including metric aggregations: `<StaticQuestion card={{ query }} />`
- Full interactive question: `<InteractiveQuestion card={{ query }} />`

When you need the set of SDK-supported question displays, do not copy a local list. In generated apps, search `node_modules/@metabase/embedding-sdk-react/dist/index.d.ts` for the exact declaration `declare const cardDisplayTypes: readonly [...]` and use that tuple as the source of truth. Do not read the whole declaration file into context.

Always pass SDK-rendered ad hoc questions with a `card` object. Start with `card={{ query }}` when the user has not asked for a specific chart type and Metabase defaults can infer a reasonable display from the query. Use `card={{ query, visualization }}` when the user request or design calls for a specific chart type, such as a pie chart for a distribution, but does not ask for setting-level customization. Add `visualizationSettings` only when the user explicitly asks for a setting-level presentation change, such as hiding or renaming an axis label, showing value labels, stacking bars, adding a goal line, ordering table columns, showing pie totals/labels, or controlling series/slice order. Search `node_modules/@metabase/embedding-sdk-react/dist/index.d.ts` for `export declare type MetabaseCard`, the relevant `*VisualizationSettings` type, and any setting key you plan to use. Read the JSDoc comments attached to those declarations, then use the TypeScript declarations as the source of truth for legal `visualization` and `visualizationSettings` combinations. Build the query with `useMetabaseQueryObject`; do not call internal query resolution helpers, cast through `any`, or hardcode settings from memory.

For lightweight descriptions of the exposed settings and when to use them, read [references/visualization-settings.md](references/visualization-settings.md). Treat that file as guidance only; the installed SDK declaration decides what is legal.

Before writing a `card`, check `node_modules/@metabase/embedding-sdk-react/dist/data-app.d.ts` for the `useMetabaseQueryObject` return type. Destructure the returned `query` and use that value in `card.query`; for configured cards, type the object with `satisfies MetabaseCard`. If TypeScript reports duplicate opaque `DatasetQuery` symbols, do not force a cast; update the SDK package before using `card`.

Do not invent alternate prop names for generated queries or visualization settings. If the SDK type says a prop does not exist, believe it and use the documented `card` prop shape.

When `useMetabaseQuery` is needed, map typed rows into an explicit local view model using named properties before rendering:

```ts
const orderedAtKey = ordersTable.fields.orderedAt.name;

const chartRows = (data?.rows ?? []).map((row) => ({
  label: String(row[orderedAtKey] ?? "Unknown"),
  value: row.count,
}));
```

### SDK Chart Heights

When an SDK-rendered chart lives in a card, panel, dashboard cell, or any other area that needs a specific height, pass that height to the SDK component that owns the visualization. Setting only the outer container or card height is not enough — the chart can render taller than the card and get cut off.

- Chart only: pass `height` to `InteractiveQuestion.QuestionVisualization`.
- Default question layout with query bar: pass `height` to `InteractiveQuestion`.
- Static question: pass `height` to `StaticQuestion`.

Use the actual body height available to the chart. For example, if a card is 560px tall and has a 60px header, pass `height="500px"` to the SDK component.

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

For custom charts, use an existing charting dependency when the app already has one. Otherwise, SVG charts are fine. Keep single-value KPI cards and bespoke summaries on `useMetabaseQuery` when you need direct row data, but first consider whether an SDK scalar/smartscalar/gauge/progress view would be good enough.

If you build a custom chart, map typed SDK rows into an explicit local view model before rendering. Read typed row values with known result keys, such as `schema.tables.orders.fields.orderedAt.name` (`ordered_at`) or aggregation names like `count`/`sum`; do not read generated schema object property names such as `row.orderedAt` unless the returned column name is actually `orderedAt`. If the key only comes from `data.columns` at runtime, use `rawRows` with the matching column position or narrow the key to a literal before indexing `data.rows`. Do not write generic chart components that assume positional rows.

Chart only, without the toolbar:

```tsx
import {
  InteractiveQuestion,
  StaticQuestion,
  type MetabaseCard,
} from "@metabase/embedding-sdk-react";

import {
  aggregations,
  breakout,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";

const eventsTable = schema.tables.events;

const { query, isLoading, error } = useMetabaseQueryObject({
  source: eventsTable,
  aggregations: [aggregations.sum(eventsTable.fields.amount)],
  breakouts: [breakout(eventsTable.fields.occurredAt, { unit: "month" })],
});

if (error) {
  return null;
}

if (isLoading || !query) {
  return null;
}

return (
  <InteractiveQuestion card={{ query }}>
    <InteractiveQuestion.QuestionVisualization height="500px" />
  </InteractiveQuestion>
);
```

Configured SDK visualization:

```tsx
const { query, isLoading, error } = useMetabaseQueryObject({
  source: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { unit: "month" })],
});

if (error) {
  return null;
}

if (isLoading || !query) {
  return null;
}

const trendCard = {
  query,
  visualization: "bar",
  visualizationSettings: {
    "graph.show_values": true,
    "graph.y_axis.title_text": "Total amount",
  },
} satisfies MetabaseCard;

return (
  <InteractiveQuestion card={trendCard}>
    <InteractiveQuestion.QuestionVisualization height="500px" />
  </InteractiveQuestion>
);
```

Do not invent alternate prop names for generated queries. If the SDK type says a prop does not exist, believe it and use the documented `card` prop shape.

```tsx
const { query, isLoading, error } = useMetabaseQueryObject({
  source: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { unit: "month" })],
});

if (error) {
  return null;
}

if (isLoading || !query) {
  return null;
}

return <InteractiveQuestion card={{ query }} height="500px" />;
```

Static question:

```tsx
const { query, isLoading, error } = useMetabaseQueryObject({
  source: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { unit: "month" })],
});

if (error) {
  return null;
}

if (isLoading || !query) {
  return null;
}

return <StaticQuestion card={{ query }} height="500px" />;
```

Do not wrap `InteractiveQuestion` or `StaticQuestion` in containers that clip or move on hover. Avoid `overflow: hidden`, hover transforms, and hover-driven layout shifts around embedded Metabase UI; popovers, menus, and chart tooltips need stable geometry and visible overflow. If a parent card has a fixed height, also pass the matching available height to `InteractiveQuestion`, `StaticQuestion`, or `InteractiveQuestion.QuestionVisualization`; never rely on the parent height alone.

## Filters And Breakouts

Use helpers because they give better autocomplete and shorter errors.

```ts
filter(ordersTable.fields.quantity, ">", 0);
filter(ordersTable.fields.status, "contains", "paid");
filter(ordersTable.fields.quantity, "between", [10, 20]);
filter(ordersTable.fields.status, "not-empty");

breakout(ordersTable.fields.createdAt, { unit: "month" });
breakout(ordersTable.fields.amount, {
  binning: { strategy: "num-bins", "num-bins": 10 },
});
breakout(ordersTable.fields.state);

orderBy(ordersTable.fields.createdAt, "desc", { unit: "month" });
```

Do not hand-write `orderBys` object literals such as `{ field, direction }` or `{ fieldId, direction }`; use `orderBy(...)`. When ordering the same date field used by a date breakout, pass the same `unit` to both `breakout(...)` and `orderBy(...)`.

For top-N grouped summaries, order by the aggregation result, not the raw source field. Store the aggregation helper in a local constant and pass that same constant to both `aggregations` and `orderBy(...)`:

```ts
const avgQuantity = aggregations.avg(inventoryTable.fields.quantityOnHand);

const { query, error, isLoading } = useMetabaseQueryObject({
  source: inventoryTable,
  aggregations: [avgQuantity],
  breakouts: [breakout(inventoryTable.fields.ingredient)],
  orderBys: [orderBy(avgQuantity, "desc")],
  limit: 15,
});
```

For user-selectable sorting, build a typed map of allowed generated fields instead of indexing the whole `fields` object:

```ts
import type { MetabaseQueryOptions } from "@metabase/embedding-sdk-react/data-app";

type SortKey = "revenue" | "orders";
type ScorecardTable = typeof scorecardTable;

type ScorecardField =
  ScorecardTable["fields"][keyof ScorecardTable["fields"]];

const sortFields = {
  revenue: scorecardTable.fields.netRevenue,
  orders: scorecardTable.fields.orders,
} satisfies Record<SortKey, ScorecardField>;

const query = {
  source: scorecardTable,
  orderBys: [orderBy(sortFields[sortKey], "desc")],
} satisfies MetabaseQueryOptions<ScorecardTable>;
```

For metric queries, pass generated metric dimensions to `filter(...)` and `breakout(...)`:

```ts
filter(revenueMetric.dimensions.orders.status, "=", "paid");
breakout(revenueMetric.dimensions.orders.createdAt, { unit: "month" });
```

Filter operator rules:

- string: `=`, `!=`, `contains`, `does-not-contain`, `starts-with`, `ends-with`, `is-empty`, `not-empty`, `is-null`, `not-null`
- number: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `is-null`, `not-null`
- date: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `time-interval`, `is-null`, `not-null`
- boolean: `=`, `is-null`, `not-null`

Only date dimensions can use `unit`. Non-date dimensions can be used as breakouts without `unit`; numeric dimensions can use `binning`.

Segments are already filters:

```ts
filters: [
  schema.tables.records.segments.activeRecords,
  filter(schema.tables.records.fields.amount, ">", 100),
];
```

Use curated segments first when they exactly match the product intent. Use `filter(...)` when the UI needs a threshold, category, date range, text match, boolean condition, or other narrowing that is not already represented by a curated segment.

## Filter UI Patterns

When the user asks for custom filters, build normal React controls that feed semantic query filters.

Before implementing filters, create a filter contract for the visible dashboard. At minimum, identify:

- For each filter, name the runtime query that provides its options.
- For each filter, name the raw value used in `filter(...)`.
- For each card, table, KPI, and trend, name the generated table field or metric dimension that can receive that filter.
- If a filter only applies to one section, keep it section-scoped or omit it from the global filter bar.
- If a page needs a different date field such as `snapshotDate`, use one visible date control for that page.
- KPI/detail pairs that describe the same concept should use the same relevant filters.

Use the detailed checklist in `references/filter-ui-patterns.md` for filter state rules, runtime categorical options, stale option reset, searchable controls, and custom date-picker implementation.

For the common memoized date/category filter shape:

```tsx
type DatePreset = "30d" | "90d" | "custom" | "all";

const [datePreset, setDatePreset] = useState<DatePreset>("all");
const [customStart, setCustomStart] = useState<Date | null>(null);
const [customEnd, setCustomEnd] = useState<Date | null>(null);
const [status, setStatus] = useState("all");

const toLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const dateRange = useMemo((): readonly [string, string] | null => {
  if (datePreset === "all") {
    return null;
  }

  if (datePreset === "custom") {
    return customStart && customEnd
      ? [toLocalDateString(customStart), toLocalDateString(customEnd)]
      : null;
  }

  return getPresetDateRange(datePreset);
}, [datePreset, customStart, customEnd]);

const orderFilters = useMemo(
  () => [
    ...(dateRange
      ? [filter(ordersTable.fields.createdAt, "between", dateRange)]
      : []),
    ...(status === "all"
      ? []
      : [filter(ordersTable.fields.status, "=", status)]),
  ],
  [dateRange, status],
);
```

When date picker state uses `Date | null`, convert selected dates with a local `YYYY-MM-DD` formatter before passing them to `filter(..., "between", range)`. Do not use `date.toISOString().split("T")[0]` for local date filters.

## Result Shape And Charts

- Prefer keyed `data.rows`.
- Never treat `data.rows` as positional arrays. Do not use `row[0]`, `row[1]`, `DisplayRow`, or tuple casts for `useMetabaseQuery` row objects.
- Inspect `data.columns` before mapping low-level `rawRows`, but do not use arbitrary `data.columns[].name` strings to index typed `data.rows`.
- Runtime row objects are keyed by returned Metabase column names, usually `column.name` such as `total_amount` or `average_score`. Do not assume generated schema keys like `totalAmount` or `averageScore` are runtime row keys.
- For generated field references, the React property path and runtime result key can differ: `schema.tables.orders.fields.orderedAt.name` might be `ordered_at`. Use `row[ordersTable.fields.orderedAt.name]`, `row.count`, or `data.columns` metadata instead of guessing `row.orderedAt`.
- Treat row values as nullable. Guard before calling number/string methods such as `toFixed`, `toLocaleString`, or string transforms.
- Use `rawRows` only for known positional shapes.
- Aggregation columns may be named `count`, `sum`, or `avg`; match metadata when needed.
- If a custom visualization needs several helper aggregations with the same output name, such as multiple `aggregations.sum(...)` calls, prefer separate single-aggregation queries so each typed row has the known `sum` key. If one multi-aggregation query is necessary, read `rawRows` by column position after checking `data.columns`; do not depend on generated names like `sum_2` unless they are explicitly typed or narrowed in the app code.
- Grouped queries can include a `null` breakout bucket. Render it as `"Unknown"` or filter it out deliberately.
- Time-series charts need multiple ordered buckets. Do not fake sparklines for scalar or one-point results.
- Multi-series charts with different units or magnitudes need separate axes or normalization.
- Format user-facing values: currency to at most 2 decimals, counts as whole numbers, dates as readable labels.
- Do not render ambiguous derived business values unless the semantic layer description or inspected sample values make the meaning and units obvious.
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
- Use metrics when the schema exposes a curated metric aggregation for the page's core business question.
- Use filters to focus the query on the UI's intent.
- Use breakouts to create trends, category comparisons, and grouped summaries.
- If the enriched result is still a sortable/drillable table, render it with SDK visualization components instead of rebuilding table behavior in React.

Avoid manual classification when the semantic layer already has the concept. Prefer curated segments, fields, or measures over string matching, threshold heuristics, or category reconstruction in React.

If no curated schema entry supports the intended UI, leave the section out or ask for semantic-layer curation. Do not keep mock data or placeholder analytics in the finished app.

## Final Checks

- Run `npm run typecheck`.
- Keep TypeScript diagnostics compact in the chat or handoff. Use the full output locally to fix the app, but report grouped root causes and only a few representative diagnostics instead of pasting the entire `tsc` output.
- Verify every rendered value can be traced to a returned row property, schema field, measure, or deterministic transform.
- Search touched files for `row[0]`, `row[1]`, `row.orderedAt`, `row.orderDate`, `as unknown as`, `DisplayRow`, `<select`, `margin`, `rate`, `score`, `percent`, `%`, `* 100`, and `.toFixed`; fix positional rows, result-key guesses, entity `<select>` filters, and unsupported business-field interpretations.
- Verify every date preset bar includes Custom last unless explicitly omitted, every visible date filter affects the current page, and no page shows duplicate date filters for one scope.
- Verify `data_app.yml` / `data_app.yaml` points at the built bundle path and that the bundle path is tracked by git.
- For every visible filter, verify "All" maps to no filter, selected values come from runtime query results, and each non-All option changes every card it claims to affect.

## Common Mistakes

- Creating or searching for Metabase content during app building.
- Importing older hooks instead of `useMetabaseQuery`.
- Copying raw numeric IDs into constants instead of using generated schema objects.
- Inventing ad hoc measure objects such as `{ name: "count" }` or `{ name: "sum", field: fieldId }`.
- Passing raw strings for table fields.
- Adding lookup helpers instead of using keyed generated schema objects.
- Inventing SDK component prop names instead of using `query` for generated table queries.
- Mixing fields, segments, or measures from unrelated tables.
- Adding a filter UI that sends empty values instead of omitting the filter.
- Hardcoding categorical filter values instead of querying the runtime values from Metabase.
- Displaying entity names but filtering by those names when a stable ID is available.
- Applying a dashboard-level filter to only one KPI while related charts and tables ignore it.
- Showing a global Date Range plus a page-specific Snapshot Date where one date filter has no effect.
- Letting a KPI and its detail table use different date or category filters without explaining the difference.
- Rendering `Margin`/`Rate`/`Score`/`Health` with invented `%`, stars, colors, or thresholds.
- Shipping a date preset bar with no Custom range option, or Custom before All time.
- Charting opaque IDs such as `franchise_id` when a user-facing name is available.
- Rendering an entity filter in a plain `<select>`, even if the current runtime option list is short.
- Using native `<input type="date">` and shipping browser-controlled `mm/dd/yyyy` placeholders or unthemed calendar popovers.
- Assuming `filter(...)` fully validates value types.
- Letting a `null` bucket become the latest time-series point.
- Hardcoding business values, labels, timestamps, or rankings.
- Creating chart-ready arrays by hand instead of deriving them from queried `data.rows`.
- Casting typed SDK rows to generic tuple rows such as `[string, number]`.
- Reading generated object property names such as `row.orderedAt` when Metabase returns column names such as `ordered_at`.
- Rendering fields that are not present in the schema or returned query result.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating nested `MetabaseProvider` instances instead of sharing one provider at the app boundary.
