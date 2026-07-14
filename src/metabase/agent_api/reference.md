# Metabase Agent API - Complete Reference

The Agent API is a REST API for building headless, agentic BI applications on
top of Metabase's semantic layer. It supports discovering tables and metrics,
inspecting their fields, constructing queries, and executing them - all scoped
to the authenticated user's permissions.

Base path: /api/agent

## Key concepts

- **Tables**: Database tables visible to the user.
- **Metrics**: Standalone saved queries that represent pre-defined aggregations
  (e.g., "Total Revenue"). Metrics are stored in collections and can be used
  as a data source in the API. They have a fixed aggregation, but can be
  filtered and grouped by their queryable dimensions. Read
  `metabase://metric/{id}/dimensions` via POST /v1/read-resource to inspect a
  metric's dimensions, and POST /v2/construct-query with a program whose
  `source` is `{"type": "metric", "id": <id>}` to query one.
- **Measures**: Lightweight, reusable aggregation expressions (e.g.,
  `SUM(total)`) associated with a specific table. Unlike metrics, measures are
  not standalone queries - they are building blocks that can be referenced in
  table queries via `["measure", id]` inside an `aggregate` operation. Discover
  available measures by reading `metabase://table/{id}/fields` via
  POST /v1/read-resource.
- **Segments**: Pre-defined filter conditions (e.g., "Active Users") that can
  be applied to queries via `["filter", ["segment", id]]`.
- **Field IDs**: Integer identifiers for database columns. These are the real
  database field IDs returned by the table/metric detail endpoints. Use them
  inside operator forms as `["field", N]`.

## Authentication

Two modes, both requiring JWT to be configured in Metabase admin settings
(Admin > Settings > Authentication > JWT):

### 1. Stateless JWT (recommended for agents)

Pass a signed JWT directly in each request:

```
Authorization: Bearer <jwt>
```

The JWT must be signed with the shared secret configured in Metabase. Required
claims:

| Claim | Type   | Required | Description                         |
| ----- | ------ | -------- | ----------------------------------- |
| iat   | int    | Yes      | Issued-at time (Unix seconds). JWT  |
|       |        |          | must be <180 seconds old.           |
| email | string | Yes      | Email matching a Metabase user. The |
|       |        |          | claim name is configurable via the  |
|       |        |          | jwt-attribute-email admin setting   |
|       |        |          | (default: "email").                 |

Optional claims: first_name, last_name, groups (for group sync).

Example JWT payload:

```json
{
  "iat": 1706640000,
  "email": "analyst@example.com"
}
```

### 2. Session-based

Exchange a JWT at `POST /auth/sso/to_session` to get a session token, then pass it via:

```
X-Metabase-Session: <session-token>
```

### Error responses (401)

```json
{"error": "missing_authorization", "message": "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
{"error": "invalid_authorization_format", "message": "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"}
{"error": "invalid_jwt", "message": "Invalid or expired JWT token."}
{"error": "jwt_not_configured", "message": "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
```

## Permissions

All endpoints enforce the authenticated user's data permissions. If the user
lacks access to a table or metric, the API returns 403.

## Parameter naming conventions

Query parameters on GET endpoints use kebab-case (e.g., `with-fields`,
`with-related-tables`). JSON request and response bodies use snake_case (e.g.,
`table_id`, `field_id`). This applies consistently across all endpoints.

## Endpoints

### GET /v1/ping

Health check.

Response: `{"message": "pong"}`

### POST /v1/read-resource

Read one or more Metabase entities by `metabase://` URI. Replaces the older
per-entity GET endpoints (`/v1/table/{id}`, `/v1/metric/{id}`, the
`*_field_values` endpoints, and various GET browse endpoints) with a single
unified surface.

Request:

```json
{
  "uris": ["metabase://table/42", "metabase://metric/10/dimensions"]
}
```

Up to 5 URIs per call. List endpoints (e.g. `metabase://databases`,
`metabase://collection/{id}/items`) cap at 25 items and signal `truncated`
plus `total` when more are available; drill into specific URIs or refine
via `/v1/search`.

#### URI catalog

**Navigation (top-level lists):**

- `metabase://databases`
- `metabase://collections` (add `?tree=true` for the full hierarchy)
- `metabase://user/recent-items`

**Database drill-down:**

- `metabase://database/{id}`
- `metabase://database/{id}/tables`
- `metabase://database/{id}/models`
- `metabase://database/{id}/schemas`
- `metabase://database/{id}/schemas/{schemaName}/tables`

**Collection drill-down:**

- `metabase://collection/{id}` (`id` may be an integer or `"root"` / `"trash"`)
- `metabase://collection/{id}/items`
- `metabase://collection/{id}/subcollections`

**Entity drill-down:**

- `metabase://table/{id}` (`/fields`, `/fields/{field_id}`, `/derived`)
- `metabase://model/{id}` (`/fields`, `/fields/{field_id}`, `/sources`)
- `metabase://question/{id}` (`/fields`, `/fields/{field_id}`, `/sources`)
- `metabase://metric/{id}` (`/dimensions`, `/dimensions/{dimension_id}`)
- `metabase://transform/{id}` (`/sources`, `/target`)
- `metabase://dashboard/{id}` (`/items`)

Response:

```json
{
  "resources": [
    {"uri": "metabase://table/42", "content": { ... }},
    {"uri": "metabase://metric/10/dimensions", "content": { ... }}
  ],
  "output": "<resources>...</resources>"
}
```

Per-URI permission checks happen inside the dispatcher: single-entity URIs
return `:error` when `mi/can-read?` denies, list endpoints silently filter
unreadable items.

`:output` is an XML-shaped string formatted for LLM consumption. Programmatic
callers should rely on the `:resources` array.

Errors:

- 400 when more than 5 URIs are provided.
- The endpoint never raises 404 for a single-URI miss; per-URI errors are
  reported inside the response under `resources[].error`.

### POST /v1/search

Search for tables and metrics. Supports keyword and semantic search. Results
are ranked using Reciprocal Rank Fusion when both query types are provided.

Request:

```json
{
  "term_queries": ["revenue", "orders"],
  "semantic_queries": ["how much money did we make"]
}
```

At least one of `term_queries` or `semantic_queries` should be provided. Both
are arrays of strings. Results are limited to 50 by default.

Response:

```json
{
  "data": [
    {
      "type": "table",
      "id": 42,
      "name": "ORDERS",
      "display_name": "Orders",
      "description": "All customer orders",
      "database_id": 1,
      "database_schema": "PUBLIC",
      "verified": false
    },
    {
      "type": "metric",
      "id": 10,
      "name": "Total Revenue",
      "verified": true
    }
  ],
  "total_count": 2
}
```

### POST /v2/search

The `search` tool: one entry point for discovery, over every kind of content.
Three modes, and a call has to pick exactly one — a call that picks none is a
400 naming all three.

| Mode | How you ask for it |
| --- | --- |
| Ranked search | `term_queries` (keywords) and/or `semantic_queries` (natural language) |
| Listing | any filter (`type`, `collection_id`, `created_by`, `archived`) with no queries |
| Recents | `recent: true` — the caller's recently viewed items |

Each query is searched separately and the rankings are merged (reciprocal rank
fusion), so send one query per concept rather than one long sentence.

Request:

```json
{
  "term_queries": ["revenue"],
  "type": ["question", "dashboard"],
  "collection_id": 12,
  "created_by": "me",
  "archived": false,
  "limit": 20,
  "offset": 0,
  "fields": null,
  "response_format": "concise"
}
```

- `type` — `question`, `model`, `metric`, `measure`, `segment`, `dashboard`,
  `document`, `collection`, `table`, `database`, `transform`, `snippet`.
- `collection_id` — a numeric id or a 21-character `entity_id`; matches the
  collection and everything nested under it.
- `created_by` — `"me"`. Only questions, models, metrics, dashboards, measures,
  and documents record a creator; combining it with any other type is a 400
  rather than an empty result.
- `snippet` is not in the search index and is served from the snippet table:
  it is matched by `term_queries` only, and cannot be combined with
  `collection_id` or `created_by`. A caller without native-query permission
  gets none.

Response — the bounded list envelope. `total` is present only when the set is
countable (a fused ranking is a union of ranked windows and counts nothing):

```json
{
  "data": [
    {
      "id": 42,
      "name": "Revenue Overview",
      "type": "dashboard",
      "description": "Weekly revenue vs target",
      "collection_path": "Our analytics / Finance / KPIs"
    }
  ],
  "returned": 1,
  "total": 12,
  "truncated": true,
  "truncation_message": "12 results — showing 1. narrow with `type`, `collection_id` or page with `offset: 1`."
}
```

`response_format: "detailed"` returns every field the search index carries
instead of the five above. A concise hit's `description` is its **first line** —
a page of hits is a menu, and a paragraph per hit spends the response budget on
prose the agent will not read before it picks one; `detailed` and a `fields` pick
both return it whole. `fields` picks dot-paths out of a hit and overrides
`response_format`.

### POST /v2/browse-data

The `browse_data` tool: one endpoint for the data hierarchy — databases,
schemas, tables, models, fields. The action is a named enum, never inferred
from which arguments happen to be present.

| Action | Arguments | Returns |
| --- | --- | --- |
| `list_databases` | — | the databases the caller may see |
| `list_schemas` | `database_id` | the database's schemas, as strings |
| `list_tables` | `database_id`, `schema?`, `search?` | the database's tables |
| `list_models` | `database_id` | the models built on that database |
| `get_fields` | `table_ids` (≤ 20) | each table with its fields |

Shared arguments: `include_hidden` (hidden tables/fields, default `false`),
`response_format`, and — for the `list_*` actions — `limit` (default 50, max
200), `offset`, and `fields`. `search` is a case-insensitive substring filter on
table name. Every id argument accepts a numeric id or a 21-character `entity_id`.
`fields` picks dot-paths out of a row and overrides `response_format`; it does
not apply to `list_schemas` (which returns bare strings) or to `get_fields`
(whose table units carry the field list `get_fields` exists for).

Request:

```json
{
  "action": "list_tables",
  "database_id": 1,
  "schema": "PUBLIC",
  "search": "order",
  "limit": 50,
  "offset": 0
}
```

`list_*` responses are the bounded list envelope (`data`, `returned`, `total`,
`truncated?`, `truncation_message?`); a cut page's message names the narrowing
parameters and the next offset ("143 tables in schema `public` — showing 50.
narrow with `search` or page with `offset: 50`."). A page is bounded by both the
row cap and the response budget: `response_format: "detailed"` returns whole REST
records, and two hundred of those overrun a response long before two hundred rows
do, so a page that will not fit comes back smaller and the message names the
offset it actually reached.

`get_fields` bounds by response budget with per-table fault isolation: complete
tables in request order until the budget runs out, then the rest named in
`omitted` — never a silently half-emitted table. `total` counts the requested
tables. Requested ids the caller cannot see (or that name nothing) are also
listed in `omitted` with the reason.

```json
{
  "data": [
    {"id": 7, "name": "ORDERS", "display_name": "Orders", "schema": "PUBLIC",
     "db_id": 1, "entity_type": "entity/TransactionTable",
     "fields": [
       {"id": 41, "name": "TOTAL", "display_name": "Total",
        "base_type": "type/Float", "semantic_type": null,
        "table_id": 7, "fk_target_field_id": null, "description": null}
     ]}
  ],
  "returned": 1,
  "total": 2,
  "truncated": true,
  "truncation_message": "1 of 2 tables returned — the rest exceeded the response budget; request each omitted table in its own `get_fields` call.",
  "omitted": [
    {"id": 9, "name": "PRODUCTS", "reason": "response budget — request it in a separate call"}
  ]
}
```

When a requested table is too wide to fit a response on its own — wherever it
sits in `table_ids` — that table comes back as an explicit slice instead, and
every other requested table is named in `omitted`: a slice beside whole tables
would be two bounding rules in one response, and omitting the wide one means an
agent that asked for its fields never gets them. The slice is fields in position
order, `returned`/`total` field counts on the table, and a `truncation_message`
naming the continuation — "ORDERS: 150 of 620 fields — continue with
`browse_data(action: "get_fields", table_ids: [7], offset: 150)`". `offset`
applies to `get_fields` only with a single table in `table_ids`, to continue such
a slice.

`response_format: "detailed"` on `get_fields` returns each field's whole REST
record (fingerprint stats, `has_field_values`), attaches up to 20 stored
sample `values` to list-valued fields (via the same sandbox-aware path the
field-values endpoints read), and adds each table's `derived` questions,
models, and transforms.

### POST /v2/browse-collection

The `browse_collection` tool: the collection hierarchy — what a collection
holds, or the collections below it.

| Mode | Arguments | Returns |
| --- | --- | --- |
| `items` (default) | `type?`, `sort_column?`, `sort_direction?`, `limit?`, `offset?`, `fields?` | the collection's contents, pinned first |
| `tree` | `depth?` | the sub-collections below it, without their contents |

`id` takes a numeric id, a 21-character `entity_id`, `"root"` (the top level),
or `"trash"` (archived content). `type` is `question`, `model`, `metric`,
`dashboard`, `collection`, `document`, or `timeline` — the same vocabulary
`search` returns and `get_content` takes, so an item forwards into a read
without a translation table. Collection *namespaces* (snippet folders,
transform folders) are not addressable: snippets and transforms are discovered
through `search` and read through `get_content`.

Request:

```json
{
  "id": 12,
  "type": ["dashboard", "question"],
  "sort_column": "last_edited_at",
  "sort_direction": "desc",
  "limit": 50,
  "offset": 0
}
```

`items` responses are the bounded list envelope, and the listing is the app's
own — same permission filter, same pinned-first order:

```json
{
  "data": [
    {"id": 31, "name": "Weekly Signups", "type": "question", "description": null,
     "collection_id": 12, "collection_position": 1,
     "last-edit-info": {"id": 2, "email": "ana@example.com", "first_name": "Ana",
                        "last_name": "Diaz", "timestamp": "2026-07-02T10:04:00Z"}}
  ],
  "returned": 1,
  "total": 14,
  "truncated": true,
  "truncation_message": "14 items in \"Marketing\" — showing 1. narrow with `type` or page with `offset: 1`."
}
```

`fields` (items mode) picks dot-paths out of an item's full record — `["id",
"name"]` — and overrides `response_format`. A path is valid when the item's
projection declares it or a returned record carries it, so a detailed-only
property is pickable and a typo is refused even when the page came back empty
(checking only the records would let `fields: ["naem"]` answer `[]`, which reads
as "nothing there"). An unknown path is a 400 listing the paths that exist and
naming the nearest one.

`tree` mode carries collection nodes with their `children`. A tree does not page:
a branch cut by the per-node cap, the node budget, or `depth` carries a
`truncation_message` naming the call that re-roots on it ("14 more under
\"Finance\" — browse_collection(id: 45, mode: \"tree\")").

```json
{
  "data": [
    {"id": 45, "name": "Finance", "description": null,
     "children": [{"id": 46, "name": "KPIs", "description": null, "children": []}]}
  ],
  "returned": 1,
  "total": 1
}
```

### POST /v2/content

The `get_content` tool: the generic typed fetch. The agent already holds
`{type, id}` — `search` handed it one, `browse_collection` listed one — and this
is where it cashes it in.

`items` takes up to 10 `{type, id}` pairs, and they may be of different types: a
dashboard and the questions on it come back in one call. `type` is `question`,
`model`, `metric`, `measure`, `segment`, `dashboard`, `document`, `collection`,
`snippet`, `alert`, `subscription`, `timeline`, or `transform` — transforms are
read-only. `id` is a numeric id or a 21-character `entity_id` (an alert has no
`entity_id` and takes a number).

Request:

```json
{
  "items": [{"type": "dashboard", "id": 7}, {"type": "question", "id": 42}],
  "include": ["definition", "revisions"],
  "response_format": "concise"
}
```

Each element of `data` echoes the `type` and `id` it was addressed by and
carries its own type's fields — a heterogeneous array, with no unified output
schema. An id that names nothing, or something the caller may not read, comes
back as an `error` on its own element; the rest of the batch is unaffected.
`omitted` names the items the response budget cut, whole items only.

```json
{
  "data": [
    {"type": "question", "id": 42, "name": "Weekly signups", "display": "line",
     "description": null, "database_id": 1, "table_id": 9, "source_card_id": null,
     "collection_id": 12, "archived": false},
    {"type": "question", "id": 99, "error": "Not found."}
  ],
  "returned": 2,
  "total": 2
}
```

Two projections are more than a subset of the REST record.

A **dashboard**'s concise read is the *editing skeleton*: its tabs, its
parameters with the dashcards each one filters, and one summary row per dashcard
— dashcard id, kind (`card`, `text`, `heading`, `link`, `iframe`, `action`), card
id and name, tab, `{row, col, size_x, size_y}`, series, inline parameters. That
is every input `dashboard_write`'s op grammar takes, and never the raw REST
`dashcards` array, whose every element nests the card's whole `dataset_query` and
visualization settings. Those ride `include: ["layout"]`, which is what
`patch_dashcard` edits against.

A **document**'s body comes back as `content_markdown`, the dialect
`document_write` takes; the stored ProseMirror tree is not in the response.

#### `include`

Call-level, not per-item: one list applied to every item the section means
something for. A section that does not fit an item's type is skipped for that
item and named in its `skipped_includes`, rather than erroring the batch.

| Section | Types | Adds to the element |
| --- | --- | --- |
| `definition` | question, model, metric, measure, segment, transform | `definition` — the query, in the portable dialect the write tools take |
| `fields` | question, model, metric | `fields` — the columns the saved question returns |
| `parameters` | question, model, metric, dashboard | `parameters`, and `template_tags` when the question is native |
| `layout` | dashboard | `layout` — the raw dashcards, with visualization settings and parameter mappings |
| `dimensions` | metric | `dimensions` — the columns the metric can be grouped and filtered by |
| `revisions` | question, model, metric, dashboard, document, measure, segment, transform | `revisions` — the change history; each row's `id` is what `revert_content` takes |

`definition` is the one that closes the loop. The stored `dataset_query` speaks
numeric field refs; `execute_query` and `question_write` speak portable ones. The
server converts, so a read hands back exactly what a write will accept:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
             "aggregation": [["count", {}]]}]}
```

`fields` (the parameter, not the section) picks dot-paths out of each item's full
record — `["id", "collection_id"]` — and overrides `response_format`. It applies
to every item, and the paths it may name are declared by the projections of the
types in the batch, so a path one type carries and another does not is simply
absent from the ones that lack it; a path no type declares and no record carries
is an error listing the ones that exist and naming the nearest.

### POST /v2/parameter-values

The `get_parameter_values` tool: the values a dashboard or question filter
accepts, from the same chain-filter engine the app's filter widget reads.

Request:

```json
{
  "target": "dashboard",
  "id": 7,
  "parameter_id": "abc12345",
  "query": "ca",
  "constraints": {"def67890": "CA"}
}
```

- `target` — `dashboard` or `question`.
- `parameter_id` — the parameter's id; `get_content` with
  `include: ["parameters"]` lists them. An id the target does not carry is a 400
  that says so.
- `query` — search the values instead of listing the first page of them.
- `constraints` — the values already chosen for the *other* parameters, so a
  dependent filter returns only what is reachable under them. Dashboards only;
  sending it with `target: "question"` is a 400.

Response — the REST shape verbatim. A value is `[value]`, or
`[value, label]` when the column is remapped; pass the value, show the label.
`has_more_values` marks a list the backend capped (narrow it with `query`):

```json
{
  "values": [["CA", "California"], ["NY", "New York"]],
  "has_more_values": false
}
```

### POST /v2/question-write

The `question_write` tool: create or update a question or a model. `method` is
the only required argument — `"create"` or `"update"` — and the rest of the
contract is per-method, enforced at runtime with errors that name the fix. A
strict client sends `null` for every argument it does not set, so a null is not
a value: on an update it means "leave this alone".

| Method | Needs | Notes |
| --- | --- | --- |
| `create` | `name`, and exactly one query source | `id` is refused — a create mints its own |
| `update` | `id` | changes only the fields the call names |

The query source is exactly one of `query_handle` (a handle `execute_query`,
`execute_sql`, or an earlier write minted — it saves the query that ran, byte
for byte), `query` (portable MBQL 5, the dialect `/v2/execute-query` takes), or
`native` (`{database_id, sql, template_tags?}`, which needs native-query
permission on the database).

`template_tags` types the `{{variables}}` the SQL declares, keyed by variable
name: `type` is `text`, `number`, `date`, or `dimension`, and a dimension also
takes the `field_id` it filters and the `widget_type` the question shows for it
(`"string/="`, `"date/all-options"`, …). Optional per variable: `display_name`,
`default`, `required`. A variable the SQL does not declare is a 400 naming the
ones it does — a value bound to a variable that is not there would silently do
nothing.

| Parameter | Meaning |
| --- | --- |
| `card_type` | `"question"` (default) or `"model"`. On an update, this converts the card. |
| `name`, `description` | |
| `collection_id` | Where it lands, or where it moves to: an id, an entity_id, or `"root"` for the top level. **Omitted on a create, it is saved to the caller's personal collection** — not to shared "Our analytics". |
| `dashboard_id` | Save the question inside a dashboard (a dashboard question). Not with `collection_id`: a card in a dashboard lives in the dashboard's collection. |
| `collection_position` | Pin it, at this position. |
| `display` | `"table"` (default), `"bar"`, `"line"`, … |
| `visualization_settings` | REST shape; defaults to `{}`. |
| `cache_ttl` | Hours to cache results for. |
| `column_metadata` | Models only: `[{name, display_name?, description?, semantic_type?, visibility_type?}]`, one entry per column being changed. It is merged into the columns the query itself yields and persists as the card's `result_metadata`; a column the query does not return is a 400 naming the ones it does. |
| `archived` | Update only: `true` trashes, `false` restores. The only delete there is. |

Request:

```json
{
  "method": "create",
  "name": "Orders by month",
  "query_handle": "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e",
  "display": "line",
  "collection_id": 7
}
```

Response — the card's concise projection, the same shape `get_content` returns
for it, so a save needs no follow-up read:

```json
{
  "id": 42,
  "name": "Orders by month",
  "type": "question",
  "display": "line",
  "description": null,
  "database_id": 1,
  "table_id": 9,
  "source_card_id": null,
  "collection_id": 7,
  "archived": false
}
```

Every check the app's own save runs, this runs, because it calls the same
functions `POST /api/card` and `PUT /api/card/:id` call
(`metabase.queries.card-write`): run permission on the query being saved, create
or write permission on the collection it lands in and the one it leaves, the
cycle check, and the shape rules of the type.

### POST /v2/metric-write

The `metric_write` tool: create or update a metric. A metric is a card with
`type: "metric"` — the same endpoint, no separate API — and it is its own tool
because its authoring contract is its own.

`create` needs a `name` and a `definition`; `update` needs an `id`. The
`definition` is the metric's query, as portable MBQL 5, and it must have exactly
one aggregation and at most one date grouping (`lib/can-save?`, the same rule the
app applies). A definition that is not a metric is a 400 naming the change to
make. `description`, `collection_id`, `collection_position`, and `archived`
behave as they do on `question_write`; there is no display or visualization to
set, and no native source — a metric is a number, not a page of SQL.

A metric is not a *measure*: a measure is a reusable aggregation expression
attached to one table (`measure_write`), and a metric is a standalone saved query
anybody can run and drill into.

Request:

```json
{
  "method": "create",
  "name": "Total revenue",
  "definition": {
    "lib/type": "mbql/query",
    "stages": [{"lib/type": "mbql.stage/mbql",
                "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
                "aggregation": [["sum", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]]]}]
  }
}
```

Response: the card's concise projection, exactly as `question_write` returns it.

### POST /v2/execute-query

The `execute_query` tool: one call for a query you hold. It validates, runs, and
hands back a handle for what ran — the three things v1 needed `construct_query`,
`execute_query`, and `query` for.

Exactly one of `query` | `query_handle` names the query. `query` is portable MBQL
5 (the `::lib.schema/external-query` dialect described under
`/v2/construct-query`): field refs are name arrays, sources are table-name paths
or card entity_ids, never numeric ids, never base64. `query_handle` is a handle a
previous `execute_query` call minted.

| Parameter | Meaning |
| --- | --- |
| `query` | Portable MBQL 5, as a JSON object. |
| `query_handle` | A handle from an earlier `execute_query`. |
| `validate_only` | Validate and mint the handle without running anything (default `false`). |
| `row_limit` | Rows to return (default 100, max 2000). |
| `offset` | Rows to skip. Must be a multiple of the page size. |
| `response_format` | `"concise"` (default) or `"detailed"` — shapes `cols`, never `rows`. |

Request:

```json
{
  "query": {
    "lib/type": "mbql/query",
    "stages": [{"lib/type": "mbql.stage/mbql",
                "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
                "aggregation": [["count", {}]],
                "breakout": [["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "CATEGORY"]]]}]
  },
  "row_limit": 100
}
```

Response — the dataset REST shape (`cols` + `rows` as value arrays), plus the
handle and, when a page is cut, the steer to the next one:

```json
{
  "query_handle": "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e",
  "cols": [{"name": "CATEGORY", "base_type": "type/Text"},
           {"name": "count", "base_type": "type/Integer"}],
  "rows": [["Doohickey", 42137], ["Gadget", 39041]],
  "row_count": 2
}
```

`row_count` is the rows in *this* page, as it is everywhere else in the REST API.
There is no total: counting the whole result set would cost a second warehouse
query on every call, so a full page instead comes back with `truncated: true` and
a `truncation_message` naming the next `offset`. Continue by passing the
`query_handle` back with that offset — the query itself never re-travels.

A page is `row_limit` rows, or fewer if the instance's own row cap for the query
is lower (`unaggregated-query-row-limit` / `aggregated-query-row-limit`, which an
admin can set per database — the cap is read with that database's settings bound,
so a lowered per-database value is honored). The page is sized to what the query
processor will actually return, because it enforces its cap by trimming the result
rather than narrowing the SQL — so a wider page would drop rows that the next
`offset` then steps over.

A page is also bounded by the response budget: a page within the row cap can still
overrun the response — two hundred wide rows do it long before two thousand narrow
ones. When it does, the rows that fit come back with `truncated: true` and a
message naming a `row_limit` that will fit and the `offset` to continue from. That
smaller `row_limit` is a whole fraction of the one asked for, so every offset the
caller already holds stays valid.

`offset` is a multiple of the page size: MBQL pages by page number, so an
arbitrary offset is not expressible, and every offset a truncation message names
conforms. A query with no `order-by` is told so in its truncation message:
`offset` compiles to SQL `OFFSET`, whose row order across two windows a database
does not guarantee, so paging an unordered query can repeat one row and miss
another.

A handle comes back from every call, including `validate_only`, which returns
`{"query_handle": "...", "validated": true}` and nothing else. `validate_only`
runs every check execution runs — the shape rules, the row-cap and `offset`
arithmetic, query permission on every table the query reads across every stage and
join, and sandbox visibility on every column it names. A dry run that blessed what
execution would refuse would be an existence oracle for exactly the tables and
columns the permission was there to hide. It is the query
that ran, so saving it via `question_write` saves byte-identically what the caller
saw, rather than a regenerated near-miss. The store is content-addressed and keyed
by `(user, query)`: the same query from the same user is the same handle, and a
handle another user minted resolves to a 404.

Errors teach. An unresolvable name comes back as a 400 with the `error` keyword
from the resolution pipeline (`unknown-table`, `unknown-field`, `unknown-card`, …)
and a message naming the recovery. It deliberately does **not** list the names it
could have meant: the resolution pipeline's metadata provider is un-sandboxed, so
a candidate list would tell a sandboxed caller which tables exist that they cannot
otherwise see. A native query, however it arrives, is a 400 pointing at
`/v1/execute-sql` — this endpoint carries the MBQL scope, not the SQL one.

### POST /v2/construct-query

Construct an MBQL query from a representations JSON payload. Returns a
base64-encoded query string to pass to `/v1/execute`.

#### Request body

```json
{"query": <external-query-object>}
```

The `query` value is a JSON object matching `::lib.schema/external-query` —
Metabase's canonical MBQL 5 *portable representations format*, a
self-describing serialization that uses portable FKs
(`["<db-name>", "<schema>", "<table-name>", "<column-name>"]`) instead of
numeric IDs, encodes operators as `["<name>", {opts}, <args>...]` clauses, and
derives the application database from the first stage's `source-table` /
`source-card`. There is **no** auxiliary `source_entity` envelope, and no
standalone integer IDs.

The full format reference — including every operator (filters, aggregations,
expressions, temporal helpers), join syntax, multi-stage queries, FK
conventions, and worked examples — lives in the `construct_notebook_query`
tool prompt:

  `resources/metabot/prompts/tools/construct_notebook_query.md`

Minimal example:

```json
{
  "query": {
    "lib/type": "mbql/query",
    "stages": [
      {
        "lib/type": "mbql.stage/mbql",
        "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
        "aggregation": [["sum", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]]],
        "breakout":    [["field", {}, ["Sample Database", "PUBLIC", "PEOPLE", "STATE"]]],
        "limit": 100
      }
    ]
  }
}
```

#### Response

```json
{ "query": "eyJkYXRhYmFzZSI6MSwi..." }
```

The value is a base64-encoded resolved MBQL 5 query map suitable for
`/v1/execute` or for embedding in a `/v2/query` continuation token. Treat it
as opaque.

#### Error responses

The representations pipeline distinguishes user-facing input errors (the
LLM-/agent-authored query can't be resolved or doesn't validate) from internal
failures. Input errors are returned as `400 Bad Request` with the originating
ex-data fields surfaced in the body — most commonly `error`, `path`, and
`candidates`. Examples:

| `error`                       | When                                                                              |
|-------------------------------|-----------------------------------------------------------------------------------|
| `unknown-database`            | First-stage source uses a database name that doesn't exist                        |
| `unknown-table`               | Portable FK names a table that doesn't exist (with closest-match candidates)      |
| `unknown-field`               | Portable FK names a column that doesn't exist on the resolved table               |
| `unknown-card`                | `source-card:` / `[metric, {}, <eid>]` references a missing entity_id             |
| `missing-source-in-first-stage` | Neither `source-table:` nor `source-card:` was supplied on `stages[0]`          |
| `ambiguous-fk` / `no-fk-path` | An implicit-join field reference can't be auto-wired (multiple FKs / no FK)       |
| `uri-in-source-table`         | `source-table:` got a `metabase://...` URI instead of a portable FK               |

All input errors carry `:agent-error? true` in the underlying ex-data; LLM
callers are expected to read the message and self-correct on the next turn.

### POST /v2/query

Combined construct-and-execute endpoint with built-in pagination via
continuation tokens.

The request body is either:
- A representations JSON payload (`{"query": <external-query-object>}`, same
  shape as `/v2/construct-query`), **or**
- A continuation token from a previous response: `{"continuation_token": "..."}`.

Pagination is automatic. The per-page row limit is taken from the query's
`limit:` field if present, otherwise defaults to 200, and is hard-capped at 200
rows per page for memory and LLM-context safety. If the page is full and more
rows may exist, the response includes a `continuation_token` you post back to
fetch the next page.

Response (HTTP 202, streaming):

```json
{
  "status": "completed",
  "data": {
    "cols": [{"name": "ID", "base_type": "type/Integer", "display_name": "ID"}],
    "rows": [[1], [2], [3], [...]]
  },
  "row_count": 50,
  "running_time": 87,
  "continuation_token": "eyJxdWVyeSI6ey..."
}
```

To fetch the next page:

```json
{ "continuation_token": "eyJxdWVyeSI6ey..." }
```

### POST /v1/execute

Execute a query returned by /v2/construct-query. HTTP-only: the `execute_query`
tool is served by `/v2/execute-query`.

**Important: streaming response.** This endpoint streams results, so the HTTP
status code (202) is sent before query execution completes. A 202 status does
NOT guarantee the query succeeded - you must check the `status` field in the
response body. If the query fails mid-execution, the response body will contain
`"status": "failed"` with an error message, even though the HTTP status was 202.

Request:

```json
{ "query": "eyJkYXRhYmFzZSI6MSwi..." }
```

Response (HTTP 202):

The response body may contain additional fields beyond those documented here.
Ignore any fields not listed below - they are internal metadata and not part of
the stable API contract.

On success:

```json
{
  "status": "completed",
  "data": {
    "cols": [
      {
        "name": "CREATED_AT",
        "base_type": "type/DateTime",
        "effective_type": "type/DateTime",
        "display_name": "Created At"
      },
      {
        "name": "sum",
        "base_type": "type/Float",
        "effective_type": "type/Float",
        "display_name": "Sum of Total"
      }
    ],
    "rows": [
      ["2024-01-01T00:00:00Z", 15234.5],
      ["2024-02-01T00:00:00Z", 18102.75]
    ]
  },
  "row_count": 2,
  "running_time": 142
}
```

| Field        | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| status       | `"completed"` on success, `"failed"` on error                   |
| data.cols    | Column metadata (name, base_type, effective_type, display_name) |
| data.rows    | Array of row arrays, in the same order as cols                  |
| row_count    | Number of rows returned                                         |
| running_time | Query execution time in milliseconds                            |

On failure:

```json
{ "status": "failed", "error": "Query error message" }
```

Row limits:

- Simple queries (no aggregation): 2000 rows max
- Aggregated queries: 10000 rows max

### POST /v1/execute-sql

Execute a raw SQL query against a database. Streams results in the same
format as `/v1/execute`. Use this only when MBQL via `/v2/construct-query`
cannot express the question.

Requires the caller to have native-query permission on the target database;
the QP middleware enforces this, with a friendly belt-and-suspenders check
at the tool layer. Returns 403 when the user lacks permission or when the
instance setting `mcp-execute-sql-enabled` is `false` (default `true`).

Request:

```json
{ "database_id": 1, "sql": "SELECT count(*) FROM orders" }
```

Response: identical shape to `/v1/execute`.

### POST /v1/question

Save a previously constructed query as a named question (card). Pass the
`query_handle` returned by `/v2/construct-query` as the `query` field
(the MCP layer transparently resolves handles for clients connected via
MCP; direct REST callers may instead pass the base64 query string).

Request:

```json
{
  "name": "Monthly Revenue",
  "query": "<query_handle or base64>",
  "display": "line",
  "description": "Revenue by month",
  "collection_id": 7,
  "visualization_settings": {}
}
```

Response:

```json
{
  "id": 42,
  "name": "Monthly Revenue",
  "display": "line",
  "collection_id": 7,
  "description": "Revenue by month"
}
```

### PUT /v1/question/{id}

Update a saved question (card). Patch semantics - only fields you pass are
changed. Subsumes "move card to collection" - setting `collection_id` moves
the card. Setting `archived: true` archives it. Passing `query` replaces the
underlying `dataset_query`.

Request:

```json
{
  "name": "Renamed Question",
  "description": "Updated description",
  "collection_id": 7,
  "display": "bar",
  "visualization_settings": {},
  "archived": false,
  "query": "<query_handle or base64>"
}
```

Response:

```json
{
  "id": 42,
  "name": "Renamed Question",
  "display": "bar",
  "collection_id": 7,
  "description": "Updated description",
  "archived": false
}
```

### POST /v1/dashboard

Create a new dashboard, optionally populated with saved questions.

Request:

```json
{
  "name": "Revenue Dashboard",
  "description": "...",
  "collection_id": 7,
  "question_ids": [42, 43]
}
```

When `question_ids` is provided, cards are auto-positioned on the grid based
on each card's display type.

Response:

```json
{
  "id": 7,
  "name": "Revenue Dashboard",
  "collection_id": 7,
  "description": "...",
  "dashcard_ids": [101, 102]
}
```

### PUT /v1/dashboard/{id}

Update a dashboard's metadata. Patch semantics. Setting `collection_id`
moves the dashboard (and its cards). Setting `archived: true` archives the
dashboard and cascades to its cards.

Request:

```json
{
  "name": "Renamed Dashboard",
  "description": "...",
  "collection_id": 7,
  "archived": false
}
```

Response:

```json
{
  "id": 7,
  "name": "Renamed Dashboard",
  "collection_id": 7,
  "description": "...",
  "archived": false
}
```

### POST /v1/collection

Create a new collection. Optionally nested under another collection via
`parent_collection_id`.

Request:

```json
{ "name": "Marketing", "description": "...", "parent_collection_id": 1 }
```

Response:

```json
{
  "id": 12,
  "name": "Marketing",
  "parent_id": 1,
  "location": "/1/",
  "description": "..."
}
```

## Typical workflow

1. **Search** - POST /v1/search to find relevant tables, metrics, cards, or dashboards
2. **Navigate** - POST /v2/browse-data to walk databases → schemas → tables →
   fields; POST /v2/browse-collection to walk the collection hierarchy; POST
   /v2/parameter-values for the values a filter accepts; POST /v1/read-resource
   with `metabase://` URIs to drill into dashboards and other saved content
3. **Build query** - POST /v2/construct-query with a representations JSON
   payload (`{"query": <external-query-object>}`); see the
   `construct_notebook_query` tool prompt for the format reference
4. **Execute** - POST /v1/execute with the base64-encoded query, or use
   POST /v2/query to construct and execute in one round-trip with pagination
5. **Save (optional)** - POST /v1/question to persist the query as a saved
   question; PUT /v1/question/{id} to update one; POST /v1/dashboard to
   bundle questions into a dashboard; POST /v1/collection to create a
   collection
6. **Iterate** - Adjust the query and repeat steps 3-4

## Error handling

| HTTP Status | Meaning                                                                                            |
|-------------|----------------------------------------------------------------------------------------------------|
| 200         | Success (GET endpoints, construct-query)                                                           |
| 202         | Success (execute / query - streaming response)                                                     |
| 400         | Invalid representations query (validation, repair, or resolution failure; `:agent-error?` paths)   |
| 401         | Authentication failure                                                                             |
| 403         | Insufficient permissions                                                                           |
| 404         | Entity not found                                                                                   |

---
