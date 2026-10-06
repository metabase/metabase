---
name: metabase-data-app-semantic-layer
description: Use when building, creating, or editing data apps that should query Metabase tables and metrics through generated schema files like metabase.data.ts or *.metabase.data.ts.
---

# Metabase Data App Semantic Layer

## Core Rules

Keep the semantic layer and presentation layer separate.

- All Metabase context must come from the generated schema file, usually `src/metabase.data.ts` or `src/*.metabase.data.ts` (its runtime object and the `/* metadata: {...} */` block an entry opens with when it has context to give), and what the files of the app's collection are written from must come from `npm run print-resources`. Never from Metabase YAML in the repository, and never from your own API calls.
- Do not discover data through MCP tools, create Metabase content, create tables, or edit the semantic layer while building the React UI.
- Import data app query helpers from `@metabase/embedding-sdk-react/data-app`.
- Every query is a `defineQuery(...)` named export in the root-level `queries/` directory, and every action a `defineAction(...)` named export in the root-level `actions/` directory, both beside `package.json`. Create both directories before writing the first hook call; the template ships them, each with a README. The hooks enforce this at compile time: `useMetabaseQuery`, `useMetabaseQueryObject`, and `useAction` reject an inline object, a `satisfies MetabaseQueryOptions` object, and a spread copy of a definition. The error reads `Property 'definedWithDefineQuery' is missing` (or `'definedWithDefineAction'`); the fix is always to move the object into `queries/` or `actions/` as a definition and import it, never a cast.
- Every `savedQuestionEntityId` and `copiedActionEntityId` names a file in the app's collection (see *Write every query and action into the app's collection*). Keep it through refactors and renames, never copy it to another definition, and never remove it while its file exists.
- Prefer generated schema objects over raw IDs or strings. Extract local constants for top-level table objects.
- Never hand-write `DatasetQuery`/MBQL objects in app code. Do not pass inline query objects like `{ type: "query", query: { "source-table": table.id } }`, raw `source-table` clauses, raw field IDs, bare table IDs, or metric IDs to SDK components, `useMetabaseQuery`, or `useMetabaseQueryObject`. Prefer generated table and metric schema objects; for simple table-source queries, an explicit source reference like `{ type: "table", id: table.id }` is also valid.
- Build queries with `source: schema.tables.<name>`, generated `fields`, generated `segments`, generated `measures`, generated metrics in `aggregations`, generated metric `dimensions`, `filter(...)`, `breakout(...)`, `orderBy(...)`, and `aggregations` helpers such as `aggregations.count()` and `aggregations.sum(...)`. Do not use `source: schema.metrics.<name>`; metrics are aggregation expressions, not query sources.
- Do not use existing saved questions as `useMetabaseQuery` or `useMetabaseQueryObject` sources. Typed schemas do not expose `schema.questions` or support `question-collections`, since an app's resources can't copy existing saved questions.
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
- Do not cast query objects to `Parameters<typeof useMetabaseQuery>[0]` or to `DefinedQuery`. That erases the generated table/metric validation and the definition contract. Validate table ownership at the definition with `defineQuery<typeof table>(...)`; the hooks take the export with no generics.
- Do not build shared filter arrays with `ReturnType<typeof filter>[]` or `push(...)`; this can collapse overload inference. Pass raw filter state between components and build each query's `filters: [...]` inline with spreads.
- Keep runtime state out of the base query in `queries/`. A clause whose value comes from a control — a selected plan, a date range, a search box — belongs in the second argument to `useMetabaseQuery`/`useMetabaseQueryObject`, not in the query. See "Static and dynamic query parts".
- Do not include `fields` in queries with `aggregations` and `breakouts`; breakouts determine grouped result columns. Use `fields` only for row-selection queries.
- Before rendering a field, verify it exists in the generated schema object and is returned by the query. Do not guess table keys, field keys, or column names from the Metabase API, business intuition, or old mock data; only use entries actually emitted in `src/metabase.data.ts`.
- Avoid unsupported freshness or operational claims such as "real-time", "live", "understaffed", or "risk" unless the returned data or curated semantic-layer definition supports them.
- Before claiming the work is done or preparing a final handoff, run a TypeScript type-only check and report the command/result. If the check fails, fix the type errors before any final summary.

## Generate Schema

If the schema file already exists, use it. If it is missing or stale, treat schema generation as semantic-layer curation for this data app, not a mechanical export.

Choose the export scope before generating:

1. Honor an explicit scope. Otherwise infer the required content types from the app's purpose: tables, curated metrics, or actions. For example, "show orders" needs tables; row counts and sums can also use table aggregations.
2. Choose the narrowest supported scope that covers those needs, using collection IDs and database names or IDs from the request or project context. When the library type is clear but a narrower collection is unknown, use that library's whole tree.
3. Ask only for context needed to select a scope, such as which database to use when the request requires a database scope but does not identify one. Once the scope is determined, state it briefly and generate without waiting for confirmation.

Scope parameters:

- `include-data-library=true` for the whole `Library / Data` tree.
- `include-metric-library=true` for the whole `Library / metrics` tree.
- `library-collections=<id-or-entity-id>[,<id-or-entity-id>]` for specific Data or metrics library subcollections.
- `include-actions=true` for the actions the app can run, under `schema.actions`. When combined with `database=<name-or-id>`, it includes that database's actions only.
- `database=<name-or-id>` when the app should use tables from one database. Use it separately from library scopes; the API rejects that combination.

Combine library scopes when the app needs both tables and curated metrics.

Use `include-actions=true` when the app needs any saved action under `schema.actions`; it includes all readable actions, unless `database` scopes them to one database. It can be combined with `library-collections`, `include-data-library`, or `include-metric-library` so one schema can include selected tables/metrics plus all readable actions.

If the user asks for any mutation-like flow, such as creating, updating, deleting, submitting, approving, executing an action, or running a write operation, include `include-actions=true` in the typed-schema URL. Do this even when the user names one specific action, because actions are only discoverable through the generated schema.

The Metabase URL and API key live in the **repo-root** `.env.local` as
`DATA_APP_MB_URL` and `DATA_APP_MB_API_KEY` (one file per repo, usually two levels up
from the app dir, not in the app dir). The key must be one in the Administrators group:
the typed schema answers only an admin, and any other key gets a `403`. The command below `source`s that file so
the shell substitutes the values straight into `curl` — you never read, extract,
or handle the credentials yourself.

> **Never ask the user to paste the API key into the chat, and never `cat` /
> `echo` `.env.local`** — it's git-ignored and may hold other secrets, so its
> contents must stay out of the conversation. `source` it so the shell uses the
> values without exposing them. If `$DATA_APP_MB_API_KEY` or `$DATA_APP_MB_URL` is empty
> or still set to the default `mb_replace_me` placeholder after sourcing, ask
> the user to add real values themselves, then continue.

Source the credentials from the repo-root `.env.local` and generate the scoped
schema. The example below exports table data from the Data library; replace its
query parameters with the scope chosen above:

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
    "$DATA_APP_MB_URL/api/typed-schemas/v1/typescript?include-data-library=true"
)
```

An entry in the generated file opens with a `/* metadata: {...} */` block of JSON, before its runtime properties, when it has context to give for writing the app: such as a field's display name, description, and semantic type, a table's database, schema, and real name, and a metric's description, filters, and whether it's verified. It is a comment, so it never reaches the bundle and the app never imports it; read it, and never edit or reformat the file.

After a successful export, verify that the schema contains every entity needed for the requested app. If any are missing, revise the scope using available context or ask for the missing context before building the UI.

If schema generation fails, do not hide, paraphrase away, or retry past the error. Surface the typed-schema error to the user, including the failing ids, names, and message when present.

## Write every query and action into the app's collection

Every query and action a data app runs goes through a copy in the app's own collection: read access to that collection lets viewers run the app's cards, but they see data only from tables they can already read, since the app grants the collection, not the tables. Declare each one as a named export in a root-level directory beside `package.json` — `queries/` for `defineQuery(...)`, `actions/` for `defineAction(...)`. The CLI scans only those two directories, so a definition under `src/queries/`, `src/actions/`, or any other source directory is never seen. Discovery covers `.js`, `.jsx`, `.ts`, `.tsx`, `.cjs`, `.cts`, `.mjs`, and `.mts`.

```ts
import { defineAction, defineQuery } from "@metabase/embedding-sdk-react/data-app";
import schema from "../src/metabase.data";

// queries/revenue.query.ts
export const RevenueQuery = defineQuery({
  savedQuestionEntityId: "<entity ID of its saved question>",
  source: schema.tables.orders,
});

// actions/orders.action.ts
export const CreateOrder = defineAction({
  copiedActionEntityId: "<entity ID of its copied action>",
  action: schema.actions.createOrder,
});
```

Each definition is backed by serialized Metabase YAML that you write into the repository's `collections/data_apps/` directory, where the collections of the `data-apps` namespace live, as Metabase exports them. Nothing changes in Metabase until the repository is pulled; the pull loads the files into the app's collection as serialized content, like everything else the repository holds, so write the files instead of creating anything in that collection by hand. From the app's directory, `data_apps/<slug>/`, that directory is `../../collections/data_apps/`.

```
data_apps/<slug>/data_app.yaml                     collection: <entity ID of the app's collection>
collections/data_apps/<collection>.yaml            the app's collection, a root collection of the data-apps namespace
collections/data_apps/<collection>/<name>.yaml     a saved question per query, copies of the metrics they use, and a copy of each action the app runs
```

`<collection>` is the collection's name as Metabase slugs it: `data_app__sales` for `Data App: Sales`. The pull and the CLI find the app's files by content, not by path: the collection whose `entity_id` the manifest names, and the cards and actions whose `collection_id` is it.

Write the YAML in the Metabase representation format. **Before writing or editing any file under `collections/data_apps/`, load the skill for reading and writing Metabase representation YAML** (use skill discovery), and follow it and its format spec for every file there: the collection, cards, and actions. If no such skill is available, install it with `npx skills add metabase/agent-skills/skills --skill metabase-representation-format`; if it still can't be loaded, stop and tell the user instead of writing the files. None of these replaces it: YAML from an earlier app (including files in git history), a search of the spec for one field, or `npm run check-resources` passing, whose schema validation checks the schema, not the format's conventions. Every card and copy is written from what `npm run print-resources` prints, as below; the format skill is how you write it. Never guess a field's shape. Generate every new entity ID with `npx representations generate-entity-id` (`--count <n>` for several), from the app's own dev dependencies; never invent one, reuse one from another app, or keep a source entity's ID on its copy.

1. **Collection.** Once per app, write `collections/data_apps/<collection>.yaml` as a collection named `Data App: <app name>` with `namespace: data-apps`, and put its entity ID in `data_app.yaml` as `collection: <id>`. It must be a root collection of that namespace: no `parent_id`, `personal_owner_id`, `type`, `authority_level`, or `archive_operation_id`, and not `is_remote_synced`, `is_sample`, or `archived`. The pull refuses a manifest without `collection:`, and one whose collection has no file in the repository.

2. **Print what the resources are written from.** `npm run print-resources` (optionally with one file, `npm run print-resources -- queries/revenue.query.ts`) sends the app's definitions to Metabase, using `DATA_APP_MB_URL` and `DATA_APP_MB_API_KEY` from the repo-root `.env.local`, and prints, as JSON, everything as serialization writes it, every reference by name or entity ID rather than numeric ID:
   - `queries`: each definition's `export`, `file`, and `savedQuestionEntityId`, the saved question Metabase writes for it as `entity` (named after the export, in the app's collection, with that entity ID, holding the query the dev preview runs), and the entity IDs of the `metrics` it aggregates;
   - `actions`: each definition's `export`, `file`, and `copiedActionEntityId`, and the source action as `entity`;
   - `metrics`: the metrics the queries aggregate, each as `entity`.

   The numeric `id` beside an action or metric only says which source it is; no file of the app's collection holds it.

   The export answers only an admin, so the API key must be one in the Administrators group. With any other key the command fails with `403`: stop and tell the user, and never write the files another way.

   An item that can't be built or copied has an `error` instead (for example a field the query names that doesn't exist, an action that belongs to a model, or a metric or action that reads another card); stop and tell the user. Run it again after any definition changes, and update the files it affects.

3. **A saved question per query.** Write the printed `entity` to `collections/data_apps/<collection>/<name>.yaml` as it is. Its name, `type`, `display`, `creator_id`, `collection_id`, entity ID, and `serdes/meta` are already set; add nothing. The one change is in its `dataset_query`: each metric reference (`[metric, {}, <entity ID>]`) points at the app's copy of that metric (step 4) instead of the source metric's entity ID. Write it yourself in the format skill's layout (how it lays out MBQL clauses), keeping the printed key order, not by serializing the printed JSON with a script: a script skips the format skill, and its output isn't checked against the format. The query is what the dev preview ran, so any difference in it changes what production runs; after writing the file, parse it back and compare it with the printed entity, and fix every difference other than the metric references.

4. **A copy per metric.** Each metric a query aggregates must be copied too, since viewers can read only the app's collection. Write the metric's printed `entity` into `collections/data_apps/<collection>/` as a card with a new entity ID and `collection_id` set to the app's collection, and reference the copy's entity ID from every question that uses the metric. One copy serves them all.

5. **A copy per action.** Write the action's printed `entity` into `collections/data_apps/<collection>/` with a new entity ID, set as the definition's `copiedActionEntityId`, and `collection_id` set to the app's collection. The app runs only query actions that belong to no model, so a copy never has a `model_id`.

Write every card and copy yourself from the printed export, following the format skill, never from YAML (not the repository's exported collections or its top-level `actions/`, not another app's collection, not git history), never from your own API calls, and never with a script that dumps the printed JSON as YAML. Its references are already in the form the YAML uses, so copy them as they are. A copy keeps exactly what its export prints, except what makes it a copy: a new `entity_id` (and the matching `serdes/meta` `id`, with a label from the copy's name) and `collection_id`. The print already leaves out what serialization leaves unset or at its default (`description`, `archived`, `enable_embedding`, `public_uuid`, a form field's unset settings, ...), as the format omits them: never add a key the print doesn't have, never keep one with a `null` value, and keep the printed key order.

Every card and action carries the `creator_id` the print gives; Metabase replaces it with its internal user when it loads the app.

If a source the app needs isn't in `src/metabase.data.ts`, or its export has an `error`, stop and tell the user; never write a replacement from scratch. After a source changes in Metabase, run `npm run print-resources` again and write its copy again, keeping the copy's entity ID.

Run `npm run check-resources`, and fix every file it reports. It fails, listing every problem, when the definitions and the files of the app's collection disagree: a manifest naming no collection or one without a file, a definition without its entity ID or naming one no file holds, a query naming a card that isn't a question, or a question or action no definition names; then it validates every Metabase YAML file in the repository, the app's collection files included, against the format's schema. `npm run build` runs the first check. Delete a metric copy yourself once nothing uses it. Neither command calls Metabase. The next pull validates everything again, and refuses the app's resources with a message naming the file, shown on the Data apps admin page. Fix that file and push again.

Pass the definition itself to the hook and let the SDK resolve what runs — a production build runs the copy, while the dev preview runs the authored table or action, so an app works before its resources exist:

```ts
const { data } = useMetabaseQuery(RevenueQuery, {
  filters: [filter(RevenueQuery.source.fields.status, "=", selectedStatus)],
});

const { execute, isExecuting, error } = useAction(CreateOrder);
```

Never pass an inline table-source query (not even a read-only, filter-option, or helper query), a raw action id, `savedQuestionEntityId`, `copiedActionEntityId`, or a hand-built `{ source: { type: "card", id } }`, and never spread a definition into a new object. Each defeats the swap; the authored ids also bypass the permission boundary. TypeScript rejects most of these: the hooks accept only what `defineQuery`/`defineAction` returned, so an inline object, a `satisfies`-typed object, a spread copy, and `schema.actions.<action>` all fail to compile. When `tsc` reports `Property 'definedWithDefineQuery' is missing` or `Property 'definedWithDefineAction' is missing`, the argument is not a definition: move it into `queries/` or `actions/` and import the export. Do not silence it with a cast or by wrapping the inline object in `defineQuery(...)` at the call site, which compiles but is never backed by a saved question. Keep fixed permission-boundary filters, aggregations, and breakouts inside `defineQuery` — they are baked into the saved question, so don't apply them again outside it, and put runtime clauses in the hook's second argument (see *Static and dynamic query parts*). `useAction` needs no generics: the definition types `execute`'s parameters and `result`.

Wire `package.json` with `"print-resources": "embedding-sdk-react data-apps print-resources"`, `"check-resources": "embedding-sdk-react data-apps check-resources && representations validate-schema --folder ../.."` (with `@metabase/representations` as a dev dependency), and `"build": "vite build"`. After adding, changing, renaming, or removing any definition, update the files of the app's collection, then run `npm run check-resources` and `npm run build`. Do not test or hand off the app until `npm run build` succeeds. Commit `data_app.yaml`, the app's files under `collections/data_apps/`, and the definitions together; the app picks them up when Metabase pulls the repository.

## Standard pattern

Two files per query: the definition in `queries/`, the hook call in the component. The examples from here on leave out `savedQuestionEntityId` to stay short; every real definition carries it (see *Write every query and action into the app's collection*).

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
- metrics: `schema.metrics.<metric>` inside `aggregations`
- Fields: `schema.tables.<table>.fields.<field>`
- Segments: `schema.tables.<table>.segments.<segment>`
- Measures: `schema.tables.<table>.measures.<measure>`
- metric dimensions: `schema.metrics.<metric>.dimensions.<group>.<dimension>`

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

Do not remove `savedQuestionEntityId` if you find it on a query object, or `copiedActionEntityId` on an action definition. Each names the definition's file in the app's collection — see *Write every query and action into the app's collection*.

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

## metric aggregation recipes

For a metric-backed query, pass the generated table object as `source` and the generated metric object in `aggregations`:

```ts
// queries/revenue.query.ts
const ordersTable = schema.tables.orders;
const revenueMetric = schema.metrics.revenue;

export const Revenue = defineQuery({
  source: ordersTable,
  aggregations: [revenueMetric],
});
```

Use generated metric dimensions for filters and breakouts in queries that aggregate the owning metric. Dimensions from the metric's source table work directly. Dimensions from related tables also work when the generated field includes `sourceFieldId`; prefer those related-table dimensions for readable labels instead of grouping by raw foreign key IDs:

```ts
export const PaidRevenueByMonthAndFranchise = defineQuery({
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
export const CompletedRevenueByStatus = defineQuery({
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

A metric aggregation must belong to the table source. Do not use source-card metrics in table-source queries. Generated metric dimensions are scoped to their owning metric: if a query uses `revenueMetric.dimensions.*` in filters, helper aggregations, breakouts, or orderBys, it must also include `revenueMetric` in `aggregations`. Do not use metric dimensions as standalone table fields for unrelated `count()` or table-measure queries. Generated metric dimensions must also resolve to the table source. Use `defineQuery<typeof ordersTable>({ ... })` when you want TypeScript to validate that at the definition.

## SDK-rendered views

Table fields, segments, measure aggregations, and metric aggregations must come from the queried table. Generated metric dimensions used in filters, helper aggregations, breakouts, and orderBys must resolve to the queried table and belong to a metric included in the same query's `aggregations`.
When table queries use `fields`, `segments`, `aggregations`, `breakouts`, or `orderBys`, let `defineQuery` infer the shape, or write `defineQuery<typeof recordsTable>` when ownership validation matters more than precise result-row keys.

## Interactive Metabase Views

Whether an element is an SDK question at all — and whether it is `StaticQuestion` or `InteractiveQuestion` — is decided in the data-app setup skill (*Rendering a chart: Metabase first*). Once it is: declare the query in `queries/`, resolve it with `useMetabaseQueryObject(TheQuery)`, then pass the result through the SDK question component's `card` prop.

`useMetabaseQueryObject` supports generated table queries, including metric aggregations. Use `useMetabaseQuery` when custom React needs direct row data; use `useMetabaseQueryObject` when Metabase should render or manage the visualization. Do not pass generics to `useMetabaseQueryObject`; it returns `{ query, error, isLoading }`, not query result rows.

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
- Do not use `as Parameters<typeof useMetabaseQuery>[0]` or `as DefinedQuery` to quiet query typing errors. The first hides invalid table fields, metric aggregations, and breakouts; the second hides a query without a saved question, which fails in production.

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
- Use metrics when the schema exposes a curated metric aggregation for the page's core business question.
- Use filters to focus the query on the UI's intent.
- Use breakouts to create trends, category comparisons, and grouped summaries.
- If the enriched result is still a sortable/drillable table, render it with SDK visualization components instead of rebuilding table behavior in React.

Avoid manual classification when the semantic layer already has the concept. Prefer curated segments, fields, or measures over string matching, threshold heuristics, or category reconstruction in React.

If no curated schema entry supports the intended UI, leave the section out or ask for semantic-layer curation. Do not keep mock data or placeholder analytics in the finished app.

## Final Checks

- Run `npm run typecheck`. `Property 'definedWithDefineQuery' is missing` or `Property 'definedWithDefineAction' is missing` means a hook received something other than a `queries/` or `actions/` export; move the object there and import it.
- Search touched files for `useMetabaseQuery(`, `useMetabaseQueryObject(`, and `useAction(`. The first argument must be an identifier imported from `queries/` or `actions/`; a `{`, a `defineQuery(`, a `defineAction(`, or a spread there is wrong even when it compiles. The second argument of the query hooks is the dynamic object and is written inline.
- Confirm `queries/` and `actions/` sit beside `package.json`, not under `src/`, and that every definition the app renders lives there.
- Confirm you loaded the representation format skill and checked every file of the app's collection against it; say so in the hand-off, or say that you didn't.
- Confirm every definition has its entity ID and its file in the app's collection, and each saved question matches its definition. Run `npm run check-resources`, then `npm run build`; both fail when the app's collection files no longer back the definitions.
- Keep TypeScript diagnostics compact in the chat or handoff. Use the full output locally to fix the app, but report grouped root causes and only a few representative diagnostics instead of pasting the entire `tsc` output.
- Verify every rendered value can be traced to a returned row property, schema field, measure, or deterministic transform.
- Search touched files for `row[0]`, `row[1]`, `row.orderedAt`, `row.orderDate`, `as unknown as`, `DisplayRow`, `<select`, `margin`, `rate`, `score`, `percent`, `%`, `* 100`, and `.toFixed`; fix positional rows, result-key guesses, entity `<select>` filters, and unsupported business-field interpretations.
- Verify every date preset bar includes Custom last unless explicitly omitted, every visible date filter affects the current page, and no page shows duplicate date filters for one scope.
- Verify `data_app.yaml` points at the built bundle path and that the bundle path is tracked by git.
- For every visible filter, verify "All" maps to no filter, selected values come from runtime query results, and each non-All option changes every card it claims to affect.

## Common Mistakes

- Creating or searching for Metabase content during app building. The app's `resources/` are written as files from `npm run print-resources`, never created in Metabase.
- Copying a metric or action from Metabase YAML in the repository (its exports, its top-level `actions/`, or git history), or from your own API calls, instead of from `npm run print-resources`.
- Writing a saved question yourself, adding a key the print doesn't have, or changing anything in the printed entity other than a metric reference to the app's copy.
- Writing the query object at the hook call instead of exporting it from `queries/` with `defineQuery`, or the action at `useAction` instead of from `actions/` with `defineAction`. Both are compile errors now; the fix is the directory, not a cast.
- Wrapping the inline object in `defineQuery(...)` or `defineAction(...)` at the call site. It compiles, but it is never backed by a saved question, so it is refused in production.
- Putting definitions under `src/queries/` or `src/actions/`, where the CLI never looks.
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
