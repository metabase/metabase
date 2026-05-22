# Metabase Agent API - Complete Reference

The Agent API is a REST API for building headless, agentic BI applications on
top of Metabase's semantic layer. It supports discovering tables and metrics,
inspecting their fields, constructing queries, and executing them — all scoped
to the authenticated user's permissions.

Base path: /api/agent

## Key concepts

- **Tables**: Database tables visible to the user.
- **Metrics**: Standalone saved queries that represent pre-defined aggregations
  (e.g., "Total Revenue"). Metrics are stored in collections and can be used
  as a data source in the API. They have a fixed aggregation, but can be
  filtered and grouped by their queryable dimensions. Use /v1/metric/{id} to
  inspect a metric's dimensions, and reference the metric in a representations
  JSON query as `"aggregation": [["metric", {}, "<portable_entity_id>"]]` (see
  the representations format reference linked from /v2/construct-query).
- **Measures**: Lightweight, reusable aggregation expressions (e.g.,
  `SUM(total)`) associated with a specific table. Unlike metrics, measures are
  not standalone queries — they are building blocks that can be referenced in
  table queries via `["measure", id]` inside an `aggregate` operation. Discover
  available measures for a table via GET /v1/table/{id}?with-measures=true.
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

| Claim   | Type   | Required | Description                          |
|---------|--------|----------|--------------------------------------|
| iat     | int    | Yes      | Issued-at time (Unix seconds). JWT   |
|         |        |          | must be <180 seconds old.            |
| email   | string | Yes      | Email matching a Metabase user. The  |
|         |        |          | claim name is configurable via the   |
|         |        |          | jwt-attribute-email admin setting    |
|         |        |          | (default: "email").                  |

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

### GET /v1/table/{id}

Get details for a table including fields, related tables, metrics, and
segments.

Query parameters (all boolean, all optional):

| Parameter           | Default | Description                             |
|---------------------|---------|-----------------------------------------|
| with-fields         | true    | Include field metadata                  |
| with-field-values   | false   | Include sample values on each field     |
| with-related-tables | true    | Include FK-related tables               |
| with-metrics        | true    | Include metrics defined on this table   |
| with-measures       | false   | Include measures                        |
| with-segments       | false   | Include segments defined on this table  |

Response:

```json
{
  "type": "table",
  "id": 42,
  "name": "ORDERS",
  "display_name": "Orders",
  "database_id": 1,
  "database_engine": "postgres",
  "database_schema": "PUBLIC",
  "description": "All customer orders",
  "fields": [
    {
      "field_id": 301,
      "name": "ID",
      "display_name": "ID",
      "description": "Primary key",
      "base_type": "type/BigInteger",
      "semantic_type": "type/PK",
      "database_type": "BIGINT",
      "field_values": [1, 2, 3]
    },
    {
      "field_id": 302,
      "name": "TOTAL",
      "type": "number",
      "description": "Order total",
      "database_type": "FLOAT"
    }
  ],
  "related_tables": [
    {
      "id": 43,
      "type": "table",
      "name": "PRODUCTS",
      "display_name": "Products",
      "database_id": 1,
      "related_by": "PRODUCT_ID"
    }
  ],
  "metrics": [
    {
      "id": 10,
      "type": "metric",
      "name": "Total Revenue",
      "default_time_dimension_field_id": 305
    }
  ],
  "measures": [
    {"id": 5, "name": "Sum of Total", "description": "Sum of the total column"}
  ],
  "segments": [
    {"id": 1, "name": "Active Users", "description": "Users who logged in within 30 days"}
  ]
}
```

### GET /v1/metric/{id}

Get details for a metric including its queryable dimensions.

Query parameters (all boolean, all optional):

| Parameter                       | Default | Description                           |
|---------------------------------|---------|---------------------------------------|
| with-default-temporal-breakout  | true    | Include default time dimension        |
| with-field-values               | false   | Include sample values on dimensions   |
| with-queryable-dimensions       | true    | Include dimensions for group_by       |
| with-segments                   | false   | Include applicable segments           |

Response:

```json
{
  "type": "metric",
  "id": 10,
  "name": "Total Revenue",
  "description": "Sum of order totals",
  "default_time_dimension_field_id": 305,
  "verified": true,
  "queryable_dimensions": [
    {
      "field_id": 305,
      "name": "CREATED_AT",
      "display_name": "Created At",
      "base_type": "type/DateTime"
    }
  ],
  "segments": []
}
```

### GET /v1/table/{id}/field/{field-id}/values
### GET /v1/metric/{id}/field/{field-id}/values

Get statistics and sample values for a field. The `field-id` is the integer
field ID from the detail endpoints. Accepts optional `limit` query
parameter (default: 30).

Response:

```json
{
  "field_id": 302,
  "statistics": {
    "distinct_count": 200,
    "percent_null": 0.02,
    "min": 1.5,
    "max": 500.0,
    "avg": 75.3,
    "q1": 25.0,
    "q3": 120.0,
    "sd": 45.2,
    "earliest": "2020-01-01T00:00:00Z",
    "latest": "2024-12-31T23:59:59Z"
  },
  "values": ["Gadget", "Widget", "Doohickey"]
}
```

Statistics fields vary by field type. Numeric fields include min/max/avg/q1/q3/sd.
Date fields include earliest/latest. String fields include average_length and
percent_email/percent_url/percent_state/percent_json.

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
{"query": "eyJkYXRhYmFzZSI6MSwi..."}
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
{"continuation_token": "eyJxdWVyeSI6ey..."}
```

### POST /v1/execute

Execute a query returned by /v2/construct-query.

**Important: streaming response.** This endpoint streams results, so the HTTP
status code (202) is sent before query execution completes. A 202 status does
NOT guarantee the query succeeded — you must check the `status` field in the
response body. If the query fails mid-execution, the response body will contain
`"status": "failed"` with an error message, even though the HTTP status was 202.

Request:

```json
{"query": "eyJkYXRhYmFzZSI6MSwi..."}
```

Response (HTTP 202):

The response body may contain additional fields beyond those documented here.
Ignore any fields not listed below — they are internal metadata and not part of
the stable API contract.

On success:

```json
{
  "status": "completed",
  "data": {
    "cols": [
      {"name": "CREATED_AT", "base_type": "type/DateTime", "effective_type": "type/DateTime", "display_name": "Created At"},
      {"name": "sum", "base_type": "type/Float", "effective_type": "type/Float", "display_name": "Sum of Total"}
    ],
    "rows": [
      ["2024-01-01T00:00:00Z", 15234.50],
      ["2024-02-01T00:00:00Z", 18102.75]
    ]
  },
  "row_count": 2,
  "running_time": 142
}
```

| Field        | Description                                                     |
|--------------|-----------------------------------------------------------------|
| status       | `"completed"` on success, `"failed"` on error                   |
| data.cols    | Column metadata (name, base_type, effective_type, display_name) |
| data.rows    | Array of row arrays, in the same order as cols                  |
| row_count    | Number of rows returned                                         |
| running_time | Query execution time in milliseconds                            |

On failure:

```json
{"status": "failed", "error": "Query error message"}
```

Row limits:
- Simple queries (no aggregation): 2000 rows max
- Aggregated queries: 10000 rows max

### POST /v1/question

Save a previously constructed query as a named question (card).

Request:

```json
{
  "name": "Q3 Revenue by Region",
  "query": "eyJkYXRhYmFzZSI6MSwi...",
  "display": "bar",
  "description": "Sum of order totals grouped by region",
  "collection_id": 7,
  "visualization_settings": {}
}
```

| Field                  | Required | Description                                                                                  |
|------------------------|----------|----------------------------------------------------------------------------------------------|
| name                   | yes      | Question name                                                                                |
| query                  | yes      | Base64-encoded query string returned by /v2/construct-query                                  |
| display                | no       | Visualization type (`table`, `bar`, `line`, `pie`, etc.). Defaults to `table`.               |
| description            | no       | Free-text description                                                                        |
| collection_id          | no       | Target collection. Omit / null to save at the user's personal-collection root.               |
| visualization_settings | no       | Map of viz settings                                                                          |

Response:

```json
{
  "id": 42,
  "name": "Q3 Revenue by Region",
  "display": "bar",
  "collection_id": 7,
  "description": "Sum of order totals grouped by region"
}
```

### POST /v1/dashboard

Create a new dashboard, optionally populated with existing saved questions.
When `question_ids` is provided, cards are auto-placed on the grid based on
their display type.

Request:

```json
{
  "name": "Q3 Revenue Overview",
  "description": "Top-line Q3 metrics",
  "collection_id": 7,
  "question_ids": [42, 43, 44]
}
```

| Field         | Required | Description                                                                |
|---------------|----------|----------------------------------------------------------------------------|
| name          | yes      | Dashboard name                                                             |
| description   | no       | Free-text description                                                      |
| collection_id | no       | Target collection. Omit / null to save at the user's personal-collection root. |
| question_ids  | no       | Existing card IDs to add as dashcards. User must have read access to each. |

Response:

```json
{
  "id": 11,
  "name": "Q3 Revenue Overview",
  "collection_id": 7,
  "description": "Top-line Q3 metrics",
  "dashcard_ids": [101, 102, 103]
}
```

## Typical workflow

1. **Search** — POST /v1/search to find relevant tables or metrics
2. **Inspect** — GET /v1/table/{id} or /v1/metric/{id} to get the column-name /
   schema / portable-FK info needed to write a query
3. **Explore field values** — GET /v1/table/{id}/field/{field-id}/values if
   you need to know valid filter values or field statistics
4. **Build query** — POST /v2/construct-query with a representations JSON
   payload (`{"query": <external-query-object>}`); see the
   `construct_notebook_query` tool prompt for the format reference
5. **Execute** — POST /v1/execute with the base64-encoded query, or use
   POST /v2/query to construct and execute in one round-trip with pagination
6. **Iterate** — Adjust the query and repeat steps 4-5
7. **Save (optional)** — POST /v1/question to persist the query as a card, and
   POST /v1/dashboard to assemble saved cards into a dashboard

## Error handling

| HTTP Status | Meaning                                                              |
|-------------|----------------------------------------------------------------------|
| 200         | Success (GET endpoints, construct-query)                             |
| 202         | Success (execute / query — streaming response)                       |
| 400         | Invalid representations query (validation, repair, or resolution failure; `:agent-error?` paths) |
| 401         | Authentication failure                                               |
| 403         | Insufficient permissions                                             |
| 404         | Entity not found (GET endpoints only)                                |

---
