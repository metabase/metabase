---
name: metabase-data-app-semantic-layer
description: Use when building, creating, or editing data apps that query Metabase tables through repository-generated schema files like metabase.data.ts or *.metabase.data.ts.
---

# Metabase Data App Semantic Layer

## Core Rules

Keep the semantic layer and presentation layer separate.

- All Metabase context must come from the generated schema file, usually `src/metabase.data.ts` or `src/*.metabase.data.ts`.
- Do not discover data through MCP tools, create Metabase content, create tables, or edit the semantic layer while building the React UI.
- Import data app query helpers from `@metabase/embedding-sdk-react/data-app`.
- Every query is a `defineQuery(...)` named export in the root-level `queries/` directory beside `package.json`. Create that directory before writing the first hook call; the template ships it with a README. The query hooks reject inline objects, `satisfies MetabaseQueryOptions` objects, and spread copies of definitions. The error reads `Property 'definedWithDefineQuery' is missing`; move the object into `queries/` as a definition and import it, never cast it.
- Never remove or edit a generated `savedQuestionSourceId`, even if it appears unused. Preserve it during refactors; use `npm run sync-resources` to repair or replace generated IDs.
- Prefer generated schema objects over raw IDs or strings. Extract local constants for top-level table objects.
- Never hand-write `DatasetQuery`/MBQL objects in app code. Do not pass inline query objects like `{ type: "query", query: { "source-table": table.id } }`, raw `source-table` clauses, raw field IDs, or bare table IDs to SDK components, `useMetabaseQuery`, or `useMetabaseQueryObject`. Prefer generated table schema objects; for simple table-source queries, an explicit source reference like `{ type: "table", id: table.id }` is also valid.
- Build queries with `source: schema.tables.<name>`, generated `fields`, generated `segments`, generated `measures`, `filter(...)`, `breakout(...)`, `orderBy(...)`, and `aggregations` helpers such as `aggregations.count()` and `aggregations.sum(...)`.
- Do not use existing saved questions as `useMetabaseQuery` or `useMetabaseQueryObject` sources. Data-app reconciliation cannot copy existing saved questions into the app collection.
- Prefer semantically rich table queries over shallow table dumps. Use curated table measures, segments, filters, and breakouts when they make the generated app more useful.
- Prefer semantic-layer definitions over React-side inference. If the schema has a segment or measure for a concept, use it instead of recreating the concept from raw rows. Both belong to the static query only — the dynamic second argument cannot take them, see *Static and dynamic query parts*.
- Filter UI must default to showing data. Empty controls, "All" options, and incomplete custom ranges should produce no filter instead of blocking queries or showing a blank dashboard.
- Do not hardcode categorical filter option values. A generated schema field only proves the field exists, not which values exist; query options from Metabase at runtime using the same generated schema field that the filter applies.
- Dashboard-level filters should visibly affect every compatible card, table, KPI, and trend. If a filter can only apply to one query, make that scope obvious in the UI; do not show duplicate or no-op date controls.
- Entity filters, where the stored value is an id/key and the UI shows a label, must use a single searchable combobox. Click/focus must open the option list immediately, before typing. Query options at runtime, search labels, and store the raw value. Never render entity filters as `<select>`; plain selects are only for short closed enums explicitly provided by the user.
- Use `DateRangePopover` from `@metabase/embedding-sdk-react/data-app` for custom date ranges: it wraps the app's own trigger element and opens a Metabase-styled range calendar under it. The trigger stays the app's — style it like the other filter controls — and `useDateFormatter()` from the same entry produces its label. It ships with the SDK and needs no dependency and no CSS import. `DateRangeCalendar` is the same calendar inline, for when the app already has a container. Do not install a date picker library for a range — not `react-datepicker`, `react-day-picker`, `flatpickr`, or a UI suite's picker (`@mui/x-date-pickers`, `antd`, `rsuite`, …). Do not use native `<input type="date">` either: its placeholder and calendar popover are browser-controlled, often show `mm/dd/yyyy`, and cannot be reliably themed.
- Never build a date label with `new Date("YYYY-MM-DD")` — a date-only string parses as UTC and shows the previous day west of Greenwich. Use `formatDateRange` / `formatDate` from `useDateFormatter()`, which parse in local time and format in the instance's locale.
- Reach for a third-party date picker only for what the SDK calendar does not cover, such as single-date or date-time selection; `react-datepicker` is the default pick. Then import its stylesheet (`react-datepicker/dist/react-datepicker.css`), add small CSS overrides for the app's visual style if needed, and pass `Date | null` — never `new Date("")` or another invalid date for incomplete ranges; type strict callback parameters explicitly, such as `onChange={(date: Date | null) => ...}`.
- Date bars must include Custom last by default: duration presets, All time, then Custom. Omit Custom only when the user explicitly asks for fixed presets only or no date range control.
- Never invent aggregation or measure objects such as `{ name: "count" }` or `{ name: "sum", field: ... }`. Use generated table measures or exported aggregation helpers.
- Only render values returned by Metabase or deterministic transforms of returned values. Do not invent KPI values, trends, labels, statuses, ratings, timestamps, rankings, insights, segments, or chart series.
- Do not custom-render ambiguous business fields such as `margin`, `rate`, `score`, `percent`, `health`, `risk`, or `efficiency`. Do not add `%`, multiply by 100, color-code, or render stars unless semantic-layer units explicitly support it; use an SDK table/chart, omit the field, or ask for curation.
- Visualization data must come from Metabase through `useMetabaseQuery` or `useMetabaseQueryObject` with `InteractiveQuestion`/`StaticQuestion`. Do not hardcode chart-ready arrays, sample data, demo values, or schema-shaped mock values.
- Render charts with `InteractiveQuestion`/`StaticQuestion`. When a custom visualization is allowed instead, and which of the two to use, is decided by the setup skill's *Rendering a chart: Metabase first*.
- `useMetabaseQueryObject(...)` returns `{ query, error, isLoading }`. Pass only the `query` property as `card={{ query }}` to `InteractiveQuestion` or `StaticQuestion`; never pass the whole hook result as `card.query`.
- `useMetabaseQuery().rows` are keyed objects, not tuple arrays. Never read `row[0]` / `row[1]`, and never silence this with `as unknown as [string, number][]`, `DisplayRow`, or another tuple cast. If TypeScript says property `0` does not exist, it is catching a real bug. For typed `data.rows`, use literal keys such as `row.count` or generated field names such as `row[ordersTable.fields.createdAt.name]`. Use `data.columns` with `rawRows` or after explicitly narrowing a key; do not index typed rows with arbitrary `string` values from `data.columns`.
- Do not cast query objects to `Parameters<typeof useMetabaseQuery>[0]` or to `DefinedQuery`. That erases generated table validation and the definition contract. Validate table ownership at the definition with `defineQuery<typeof table>(...)`; the hooks take the export with no generics.
- Do not build shared filter arrays with `ReturnType<typeof filter>[]` or `push(...)`; this can collapse overload inference. Pass raw filter state between components and build each query's `filters: [...]` inline with spreads.
- Keep runtime state out of the base query in `queries/`. A clause whose value comes from a control — a selected plan, a date range, a search box — belongs in the second argument to `useMetabaseQuery`/`useMetabaseQueryObject`, not in the query. See "Static and dynamic query parts".
- Do not include `fields` in queries with `aggregations` and `breakouts`; breakouts determine grouped result columns. Use `fields` only for row-selection queries.
- Before rendering a field, verify it exists in the generated schema object and is returned by the query. Do not guess table keys, field keys, or column names from the Metabase API, business intuition, or old mock data; only use entries actually emitted in `src/metabase.data.ts`.
- Avoid unsupported freshness or operational claims such as "real-time", "live", "understaffed", or "risk" unless the returned data or curated semantic-layer definition supports them.
- Before claiming the work is done or preparing a final handoff, run a TypeScript type-only check and report the command/result. If the check fails, fix the type errors before any final summary.

## Generate Schema

Choose a scope and run the repository-backed CLI to generate or refresh the schema before building the app, even if `src/metabase.data.ts` already exists. This also exercises the CLI during testing. It reads the repository's `databases/` and `collections/` representations, then fetches scoped field metadata from Metabase. Run it from the app directory. The template provides `"generate-schema": "embedding-sdk-react data-apps generate-schema"` in `package.json`; add that script to an existing app if missing.

Choose the export scope before generating:

1. Honor an explicit scope. Otherwise infer which tables the app needs from its purpose. Row counts and sums can use table aggregations.
2. Choose the narrowest supported scope, using collection IDs and database names or IDs from the request or project context. When the Data library is needed but a narrower collection is unknown, use its whole tree.
3. Ask only for context needed to select a scope, such as which database to use when the request requires a database scope but does not identify one. Once the scope is determined, state it briefly and generate without waiting for confirmation.

For repository-backed tables, segments, and measures, use one of these CLI scopes:

- `npm run generate-schema -- --database "<name-or-id>"` for one database.
- `npm run generate-schema -- --include-data-library` for the whole `Library / Data` tree.
- `npm run generate-schema -- --library-collections <id-or-entity-id>[,<id-or-entity-id>]` for specific Data library subcollections. Combine this with `--include-data-library` if needed.

The CLI requires an explicit scope and does not combine `--database` with library scopes. It finds the repository root by walking up from the app directory; pass `--repository-root <path>` if needed. It writes `src/metabase.data.ts` and caches field metadata under the app's `node_modules/.cache/`. Run the same command with `--force-refresh` when live field metadata has changed. The CLI loads `DATA_APP_MB_URL` and `DATA_APP_MB_API_KEY` from the repository root's `.env.local`; never print that file or ask the user to paste an API key into chat. If the credentials are missing or placeholders, ask the user to set them in the file.

For now, skip curated metrics, models, and actions. If the request includes them, generate the table schema with the CLI, build the supported read-only parts, and tell the user which requested parts are deferred. Do not use another schema generator or hand-write missing schema entries.

After generation, verify that `src/metabase.data.ts` contains the tables, fields, segments, and measures the app needs. If any are missing, revise the CLI scope using available context or ask for the missing context before building the UI. Surface CLI errors with their YAML path and missing reference when present.

## Synchronize every query

Everything an end-to-end prototype runs is permission-bound: it runs against a copy in the app's own collection. Read access to that collection lets viewers run the app's cards, but they need access to the underlying tables to see data. Declare each query as a named `defineQuery(...)` export in the root-level `queries/` directory beside `package.json`. `npm run sync-resources` scans that directory; a definition under `src/queries/` is never synchronized.

```ts
import { defineQuery } from "@metabase/embedding-sdk-react/data-app";
import schema from "../src/metabase.data";

// queries/revenue.query.ts
export const RevenueQuery = defineQuery({ source: schema.tables.orders });
```

Synchronization materializes the authored table query as a saved question and injects `savedQuestionSourceId`. Pass the definition itself to the hook: production runs the copy, while the dev preview runs the authored table query.

```ts
const { data } = useMetabaseQuery(RevenueQuery, {
  filters: [filter(RevenueQuery.source.fields.status, "=", selectedStatus)],
});
```

Never pass an inline table-source query, a generated ID, or a hand-built card source to the hook. Never spread a definition into a new object. If TypeScript reports `Property 'definedWithDefineQuery' is missing`, move the query into `queries/` and import its export. Keep fixed filters, aggregations, and breakouts inside `defineQuery`; put runtime clauses in the hook's second argument.

The template wires `"sync-resources": "embedding-sdk-react data-apps sync-resources"` and `"build": "npm run sync-resources && vite build"`. Run `npm run build` after changing a query definition. Do not hand-edit generated IDs or `resources_metadata.json`; commit the generated changes. If synchronization fails, surface the exact error and fix the definition or environment before retrying.

## Standard pattern

Two files per query: the definition in `queries/`, the hook call in the component.

```ts
// queries/orders.query.ts
import {
  aggregations,
  breakout,
  defineQuery,
  filter,
  orderBy,
} from "@metabase/embedding-sdk-react/data-app";
import schema from "../src/metabase.data";

const ordersTable = schema.tables.orders;

export const PaidRevenueByMonth = defineQuery({
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

```tsx
// src/pages/Overview.tsx
import { useMetabaseQuery } from "@metabase/embedding-sdk-react/data-app";
import { PaidRevenueByMonth } from "../../queries/orders.query";

const { data, isLoading, error } = useMetabaseQuery(PaidRevenueByMonth);
```

`useMetabaseQuery(...)` infers typed row data from the definition, so write no generics on the hook. To check table ownership of fields, segments, and measures, put the generic on the definition: `defineQuery<typeof ordersTable>({ ... })`. Leave it off selected-field queries when you need precise row keys from `data.rows`. The recipes below show the object passed to `defineQuery`; each one is an export in `queries/`, never an argument written at the hook.

**Call each schema entry at most once per render tree.** Multiple `useMetabaseQuery` calls on the same `questionId` (or same `tableId` + identical filters/measures/breakouts) mount independent subscriptions, fire duplicate queries, and let consumers disagree mid-load. Lift the call to the highest component that needs the data; pass `data` / `isLoading` / `error` down as props. Different ids — or the same id with different filters / breakouts — are different data sources; call them separately.

Use keyed schema objects:

- Tables: `source: schema.tables.<table>`
- Fields: `schema.tables.<table>.fields.<field>`
- Segments: `schema.tables.<table>.segments.<segment>`
- Measures: `schema.tables.<table>.measures.<measure>`

Do not pass raw dimension strings like `"created_at"` or `"segment"`.

## Static and dynamic query parts

Both query hooks take an optional second argument: the clauses that change while the app runs.

```ts
// revenue.query.ts — static, and identical on every render
const orders = schema.tables.orders;

export const RevenueQuery = defineQuery({
  source: orders,
  aggregations: [aggregations.sum(orders.fields.total)],
  breakouts: [
    breakout(orders.fields.createdAt, { unit: "month" }),
    breakout(orders.fields.plan),
  ],
});

// the component supplies only what the UI changes
const { data } = useMetabaseQuery(RevenueQuery, {
  filters: plan === null ? [] : [filter(orders.fields.plan, "=", plan)],
});
```

Split them this way even when nothing appears to depend on it: the first argument must be identical on every render, and only the second may vary with runtime state.

The dynamic clauses run as their own stage, so they see the **result columns** of the static query, not its source table. That is why `plan` is a breakout above: a control that filters on a source column only works if that column survives into the result. If it does not, add it as a breakout, or leave the static query unaggregated. Likewise, filter an aggregated static query on `count`/`sum`, not on the fields behind them.

**Segments and measures belong to the static part only.** They are defined against a table, and the dynamic stage has no table — so `filters: [orders.segments.completed]` and `aggregations: [orders.measures.revenue]` are rejected, at compile time and again at runtime. This is the one place the usual "prefer the curated definition" rule does not apply.

Put the curated definition in the static query where it resolves, and let the dynamic clause work on what came out:

```ts
export const CompletedOrders = defineQuery({
  source: orders,
  filters: [orders.segments.completed], // the segment resolves here
  aggregations: [orders.measures.revenue],
  breakouts: [breakout(orders.fields.plan)],
});

const { data } = useMetabaseQuery(CompletedOrders, {
  // a result column, not a segment or measure
  filters: plan === null ? [] : [filter({ type: "column", name: "PLAN" }, "=", plan)],
});
```

If a control must switch a segment on and off, that is a choice between static queries, not a dynamic clause: define one query per state and pick the query, or express the same condition as a filter on a result column.

Do not remove or hand-edit `savedQuestionSourceId` if you find it on a query object. It is generated synchronization state — see *Synchronize every query*.

## Table query recipes

For a table query, pass the generated table object as `source`:

```ts
// queries/records.query.ts
const recordsTable = schema.tables.records;

export const RecordStatuses = defineQuery({
  source: recordsTable,
  fields: [recordsTable.fields.id, recordsTable.fields.status],
});
```

For grouped table summaries, include at least one aggregation:

```ts
export const ActiveAmountByMonth = defineQuery({
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
export const AmountByCategory = defineQuery({
  source: recordsTable,
  aggregations: [
    aggregations.count(),
    aggregations.sum(recordsTable.fields.amount),
  ],
  breakouts: [breakout(recordsTable.fields.category)],
});
```

When a query uses the same helper more than once, give each one a `name`. The name becomes the result column's name and the row key, it is typed, and it is how `orderBy(...)` and runtime clauses refer to that aggregation. Without names, the columns come back as `sum`, `sum_2`, and so on, and sorting or filtering by one of them fails:

```ts
const totalAmount = aggregations.sum(recordsTable.fields.amount, {
  name: "total_amount",
});
const totalTax = aggregations.sum(recordsTable.fields.tax, {
  name: "total_tax",
});

export const TaxByCategory = defineQuery({
  source: recordsTable,
  aggregations: [totalAmount, totalTax],
  breakouts: [breakout(recordsTable.fields.category)],
  orderBys: [orderBy(totalTax, "desc")],
});
// Rows are keyed `total_amount` and `total_tax`.
```

Table fields, segments, measures, filters, breakouts, and orderBys must come from the queried table. Use `defineQuery<RecordsTable>({ ... })` when you want TypeScript to validate that ownership at the definition.

## SDK-rendered views

Table fields, segments, and measure aggregations must come from the queried table.
When table queries use `fields`, `segments`, `aggregations`, `breakouts`, or `orderBys`, let `defineQuery` infer the shape, or write `defineQuery<typeof recordsTable>` when ownership validation matters more than precise result-row keys.

## Interactive Metabase Views

Whether an element is an SDK question at all — and whether it is `StaticQuestion` or `InteractiveQuestion` — is decided in the data-app setup skill (*Rendering a chart: Metabase first*). Once it is: declare the query in `queries/`, resolve it with `useMetabaseQueryObject(TheQuery)`, then pass the result through the SDK question component's `card` prop.

`useMetabaseQueryObject` supports generated table queries. Use `useMetabaseQuery` when custom React needs direct row data; use `useMetabaseQueryObject` when Metabase should render or manage the visualization. Do not pass generics to `useMetabaseQueryObject`; it returns `{ query, error, isLoading }`, not query result rows.

The examples under *Rendering With SDK Components* use `return null` for minimal loading and error handling. In a real app, render the app's existing loading or error UI there. Passing `card={{ query }}` is safe while `query` is `null`; do not pass the full `{ query, error, isLoading }` hook result as `card.query`.

When wrapping `useMetabaseQueryObject` in a reusable chart/card component, destructure and render `error`; do not read only `{ query }`, because query-construction failures otherwise look like endless loading. Calling the hook inside that child component is valid React. Do not call hooks directly inside loops, conditions, or callbacks in the parent component.

Wrong/right pattern:

```tsx
const trendQuery = useMetabaseQueryObject(TrendQuery);
<InteractiveQuestion card={{ query: trendQuery }} />; // wrong

const { query: trendQuery } = useMetabaseQueryObject(TrendQuery);
<InteractiveQuestion card={{ query: trendQuery }} />; // right
```

Hook typing:

- Both hooks take a `defineQuery` export imported from `queries/` and nothing else; an inline object is a compile error. Write no generics on the hooks.
- `useMetabaseQuery(...)` infers typed row data from the definition. Put `defineQuery<typeof table>` on the definition when ownership validation matters.
- `useMetabaseQueryObject(...)` returns `{ query, error, isLoading }`. Pass the `query` property to `card={{ query }}`.
- Do not use `as Parameters<typeof useMetabaseQuery>[0]` or `as DefinedQuery` to quiet query typing errors. The first hides invalid table fields and breakouts; the second hides an unsynchronized query that fails in production.

The basic prop contract is:

- Generated table query: `<StaticQuestion card={{ query }} />`
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

If the result key only comes from `data.columns` at runtime, use `rawRows` with the matching column position, or narrow the key to a literal before indexing `data.rows`.

### Rendering With SDK Components

Chart only, without the toolbar:

```tsx
import {
  InteractiveQuestion,
  StaticQuestion,
  type MetabaseCard,
} from "@metabase/embedding-sdk-react";

import { useMetabaseQueryObject } from "@metabase/embedding-sdk-react/data-app";

import { AmountByMonth } from "../../queries/events.query";

const { query, isLoading, error } = useMetabaseQueryObject(AmountByMonth);

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
// queries/events.query.ts
export const TotalAmountByMonth = defineQuery({
  source: eventsTable,
  aggregations: [eventsTable.measures.totalAmount],
  breakouts: [breakout(eventsTable.fields.occurredAt, { unit: "month" })],
});

// the component
const { query, isLoading, error } = useMetabaseQueryObject(TotalAmountByMonth);

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
// queries/inventory.query.ts
const avgQuantity = aggregations.avg(inventoryTable.fields.quantityOnHand);

export const TopIngredientsByQuantity = defineQuery({
  source: inventoryTable,
  aggregations: [avgQuantity],
  breakouts: [breakout(inventoryTable.fields.ingredient)],
  orderBys: [orderBy(avgQuantity, "desc")],
  limit: 15,
});
```

For user-selectable sorting, the sort is runtime state, so it belongs in the hook's second argument. Build a typed map of allowed generated fields instead of indexing the whole `fields` object:

```ts
type SortKey = "revenue" | "orders";
type ScorecardTable = typeof scorecardTable;

type ScorecardField = ScorecardTable["fields"][keyof ScorecardTable["fields"]];

const sortFields = {
  revenue: scorecardTable.fields.netRevenue,
  orders: scorecardTable.fields.orders,
} satisfies Record<SortKey, ScorecardField>;

const { data } = useMetabaseQuery(Scorecard, {
  orderBys: [orderBy(sortFields[sortKey], "desc")],
});
```

`Scorecard` is the unaggregated `defineQuery({ source: scorecardTable })` export in `queries/`; its source fields survive into the result, so the dynamic stage can order by them.

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
- For each card, table, KPI, and trend, name the generated table field that can receive that filter.
- If a filter only applies to one section, keep it section-scoped or omit it from the global filter bar.
- If a page needs a different date field such as `snapshotDate`, use one visible date control for that page.
- KPI/detail pairs that describe the same concept should use the same relevant filters.

Use the detailed checklist in `references/filter-ui-patterns.md` for filter state rules, runtime categorical options, stale option reset, searchable controls, and custom date-picker implementation.

For the common memoized date/category filter shape:

```tsx
type DatePreset = "30d" | "90d" | "custom" | "all";

const [datePreset, setDatePreset] = useState<DatePreset>("all");
const [customRange, setCustomRange] = useState<[string | null, string | null]>([
  null,
  null,
]);
const [status, setStatus] = useState("all");

const dateRange = useMemo((): readonly [string, string] | null => {
  if (datePreset === "all") {
    return null;
  }

  if (datePreset === "custom") {
    const [start, end] = customRange;
    return start && end ? [start, end] : null;
  }

  return getPresetDateRange(datePreset);
}, [datePreset, customRange]);

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

`customRange` above is what `<DateRangePopover value={customRange} onChange={setCustomRange}>` stores, so there is nothing to convert. When a fallback picker's state uses `Date | null`, convert selected dates with a local `YYYY-MM-DD` formatter before passing them to `filter(..., "between", range)`. Do not use `date.toISOString().split("T")[0]` for local date filters.

## Result Shape And Charts

- Prefer keyed `data.rows`.
- Never treat `data.rows` as positional arrays. Do not use `row[0]`, `row[1]`, `DisplayRow`, or tuple casts for `useMetabaseQuery` row objects.
- Inspect `data.columns` before mapping low-level `rawRows`, but do not use arbitrary `data.columns[].name` strings to index typed `data.rows`.
- Runtime row objects are keyed by returned Metabase column names, usually `column.name` such as `total_amount` or `average_score`. Do not assume generated schema keys like `totalAmount` or `averageScore` are runtime row keys.
- For generated field references, the React property path and runtime result key can differ: `schema.tables.orders.fields.orderedAt.name` might be `ordered_at`. Use `row[ordersTable.fields.orderedAt.name]`, `row.count`, or `data.columns` metadata instead of guessing `row.orderedAt`.
- Treat row values as nullable. Guard before calling number/string methods such as `toFixed`, `toLocaleString`, or string transforms.
- Use `rawRows` only for known positional shapes.
- Aggregation columns may be named `count`, `sum`, or `avg`; match metadata when needed.
- If a query has several helper aggregations of the same kind, such as multiple `aggregations.sum(...)` calls, name each one (`{ name: "..." }`) and read the rows by those names. Never depend on generated names like `sum_2`.
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
- Use filters to focus the query on the UI's intent.
- Use breakouts to create trends, category comparisons, and grouped summaries.
- If the enriched result is still a sortable/drillable table, render it with SDK visualization components instead of rebuilding table behavior in React.

Avoid manual classification when the semantic layer already has the concept. Prefer curated segments, fields, or measures over string matching, threshold heuristics, or category reconstruction in React.

If no curated schema entry supports the intended UI, leave the section out or ask for semantic-layer curation. Do not keep mock data or placeholder analytics in the finished app.

## Final Checks

- Run `npm run typecheck`. `Property 'definedWithDefineQuery' is missing` means a query hook received something other than a `queries/` export; move the object there and import it.
- Search touched files for `useMetabaseQuery(` and `useMetabaseQueryObject(`. The first argument must be an identifier imported from `queries/`; a `{`, a `defineQuery(`, or a spread there is wrong even when it compiles. The second argument is the dynamic object and is written inline.
- Confirm `queries/` sits beside `package.json`, not under `src/`, and that every query the app renders lives there.
- Run `npm run build`; it synchronizes queries before producing the bundle.
- Keep TypeScript diagnostics compact in the chat or handoff. Use the full output locally to fix the app, but report grouped root causes and only a few representative diagnostics instead of pasting the entire `tsc` output.
- Verify every rendered value can be traced to a returned row property, schema field, measure, or deterministic transform.
- Search touched files for `row[0]`, `row[1]`, `row.orderedAt`, `row.orderDate`, `as unknown as`, `DisplayRow`, `<select`, `margin`, `rate`, `score`, `percent`, `%`, `* 100`, and `.toFixed`; fix positional rows, result-key guesses, entity `<select>` filters, and unsupported business-field interpretations.
- Verify every date preset bar includes Custom last unless explicitly omitted, every visible date filter affects the current page, and no page shows duplicate date filters for one scope.
- Verify `data_app.yaml` points at the built bundle path and that the bundle path is tracked by git.
- For every visible filter, verify "All" maps to no filter, selected values come from runtime query results, and each non-All option changes every card it claims to affect.

## Common Mistakes

- Creating or searching for Metabase content during app building.
- Writing the query object at the hook call instead of exporting it from `queries/` with `defineQuery`. The fix is the directory, not a cast.
- Wrapping the inline object in `defineQuery(...)` at the call site. It compiles, but `sync-resources` never sees it, so it is refused in production.
- Putting definitions under `src/queries/`, where `sync-resources` never looks.
- Importing older hooks instead of `useMetabaseQuery`.
- Copying raw numeric IDs into constants instead of using generated schema objects.
- Inventing ad hoc measure objects such as `{ name: "count" }` or `{ name: "sum", field: fieldId }`.
- Passing raw strings for table fields.
- Adding lookup helpers instead of using keyed generated schema objects.
- Inventing SDK component prop names instead of using `query` for generated table queries.
- Mixing fields, segments, or measures from unrelated tables.
- Passing a segment or measure to the dynamic second argument, where only result columns resolve.
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
- Reaching for native `<input type="date">` or any date picker dependency (`react-datepicker`, `react-day-picker`, a UI suite's picker) for a date range instead of `DateRangePopover`, and shipping browser-controlled `mm/dd/yyyy` placeholders or unthemed calendar popovers.
- Labelling a date trigger with `new Date("YYYY-MM-DD").toLocaleDateString()` instead of `useDateFormatter()`, so the label is a day early for users west of Greenwich.
- Assuming `filter(...)` fully validates value types.
- Letting a `null` bucket become the latest time-series point.
- Hardcoding business values, labels, timestamps, or rankings.
- Creating chart-ready arrays by hand instead of deriving them from queried `data.rows`.
- Casting typed SDK rows to generic tuple rows such as `[string, number]`.
- Reading generated object property names such as `row.orderedAt` when Metabase returns column names such as `ordered_at`.
- Rendering fields that are not present in the schema or returned query result.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating nested `MetabaseProvider` instances instead of sharing one provider at the app boundary.
