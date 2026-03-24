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
  inspect a metric's dimensions, and POST /v1/construct-query with `metric_id`
  to query one.
- **Measures**: Lightweight, reusable aggregation expressions (e.g.,
  `SUM(total)`) associated with a specific table. Unlike metrics, measures are
  not standalone queries — they are building blocks that can be referenced in
  table queries via `measure_id` in the aggregations array. Discover available
  measures for a table via GET /v1/table/{id}?with-measures=true.
- **Segments**: Pre-defined filter conditions (e.g., "Active Users") that can
  be applied to queries by referencing their segment_id.
- **Field IDs**: Opaque string identifiers for columns, formatted as
  `<prefix><entity-id>-<column-index>`. Prefix is `t` for table fields and
  `c` for metric fields. Example: `t42-3` means the column at index 3 of table 42.
  Field IDs are returned by the table/metric detail endpoints and must be used
  as-is in query construction. They are positional — always fetch current
  entity details before constructing queries.

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
`table_id`, `field_id`, `field_granularity`). This applies consistently across
all endpoints.

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
      "field_id": "t42-0",
      "name": "ID",
      "type": "number",
      "description": "Primary key",
      "database_type": "BIGINT",
      "semantic_type": "type/PK",
      "field_values": [1, 2, 3]
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
      "default_time_dimension_field_id": "c10-2"
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
  "default_time_dimension_field_id": "c10-2",
  "verified": true,
  "queryable_dimensions": [
    {
      "field_id": "c10-0",
      "name": "CREATED_AT",
      "type": "datetime"
    }
  ],
  "segments": []
}
```

### GET /v1/table/{id}/field/{field-id}/values
### GET /v1/metric/{id}/field/{field-id}/values

Get statistics and sample values for a field. Accepts optional `limit` query
parameter (default: 30).

Response:

```json
{
  "field_id": "t42-3",
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

### POST /v1/construct-query

Construct a query from a table or metric. Returns a base64-encoded query to
pass to /v1/execute.

**Important**: Field IDs used here must come from the detail endpoints
(/v1/table/{id} or /v1/metric/{id}). Always fetch entity details first.

#### Table query request

All fields except `table_id` are optional:

```json
{
  "table_id": 42,
  "filters": [],
  "fields": [{"field_id": "t42-0"}, {"field_id": "t42-1"}],
  "aggregations": [{"field_id": "t42-3", "function": "sum"}],
  "group_by": [{"field_id": "t42-5", "field_granularity": "month"}],
  "order_by": [{"field": {"field_id": "t42-1"}, "direction": "desc"}],
  "limit": 100
}
```

#### Metric query request

Metrics have a pre-defined aggregation, so only filters and group_by are
supported:

```json
{
  "metric_id": 10,
  "filters": [{"field_id": "c10-2", "operation": "greater-than", "value": "2024-01-01"}],
  "group_by": [{"field_id": "c10-2", "field_granularity": "month"}]
}
```

#### Response

```json
{"query": "eyJkYXRhYmFzZSI6MSwi..."}
```

#### Filter types

Filters are polymorphic. The required fields depend on the operation.

**Segment filter** — apply a pre-defined segment:

```json
{"segment_id": 5}
```

**Existence filters** — no value needed:

| Operation            | Description            |
|----------------------|------------------------|
| is-null              | Field is null          |
| is-not-null          | Field is not null      |
| string-is-empty      | String is empty        |
| string-is-not-empty  | String is not empty    |
| is-true              | Boolean is true        |
| is-false             | Boolean is false       |

```json
{"field_id": "t42-0", "operation": "is-not-null"}
```

**Temporal filters** — for date/datetime fields. Optional `bucket` specifies
temporal bucketing granularity for the comparison. Accepts both truncation
units (`minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`) and
extraction units (`day-of-week`, `day-of-month`, `day-of-year`,
`week-of-year`, `month-of-year`, `quarter-of-year`, `hour-of-day`,
`minute-of-hour`, `second-of-minute`). Note: this is a broader set of
values than `field_granularity` in group_by, which only accepts truncation
units.

| Operation             | Description                     |
|-----------------------|---------------------------------|
| equals                | Equals value                    |
| not-equals            | Does not equal value            |
| greater-than          | After (dates) / greater than    |
| greater-than-or-equal | On or after / greater or equal  |
| less-than             | Before (dates) / less than      |
| less-than-or-equal    | On or before / less or equal    |

```json
{"field_id": "t42-5", "operation": "greater-than", "value": "2024-01-01"}
```

For multiple values, use `values` (array) instead of `value`:

```json
{"field_id": "t42-5", "operation": "equals", "values": ["2024-01-01", "2024-06-01"]}
```

**Temporal extraction filters** — filter by date component:

| Operation              | Value type |
|------------------------|------------|
| year-equals            | int        |
| year-not-equals        | int        |
| quarter-equals         | int (1-4)  |
| quarter-not-equals     | int        |
| month-equals           | int (1-12) |
| month-not-equals       | int        |
| day-of-week-equals     | int (1-7)  |
| day-of-week-not-equals | int        |
| hour-equals            | int (0-23) |
| hour-not-equals        | int        |
| minute-equals          | int (0-59) |
| minute-not-equals      | int        |
| second-equals          | int (0-59) |
| second-not-equals      | int        |

```json
{"field_id": "t42-5", "operation": "month-equals", "value": 12}
```

For multiple values: `{"field_id": "t42-5", "operation": "month-equals", "values": [1, 2, 3]}`

**String filters**:

| Operation           | Description                          |
|---------------------|--------------------------------------|
| equals              | Exact match                          |
| not-equals          | Does not match                       |
| string-contains     | Contains substring                   |
| string-not-contains | Does not contain substring           |
| string-starts-with  | Starts with prefix                   |
| string-ends-with    | Ends with suffix                     |

```json
{"field_id": "t42-2", "operation": "string-contains", "value": "acme"}
```

For multiple values: `{"field_id": "t42-2", "operation": "equals", "values": ["A", "B"]}`

**Numeric filters**:

| Operation             | Description            |
|-----------------------|------------------------|
| equals                | Equals value           |
| not-equals            | Does not equal value   |
| greater-than          | Greater than           |
| greater-than-or-equal | Greater than or equal  |
| less-than             | Less than              |
| less-than-or-equal    | Less than or equal     |

```json
{"field_id": "t42-3", "operation": "greater-than", "value": 100}
```

For multiple values: `{"field_id": "t42-3", "operation": "equals", "values": [10, 20, 30]}`

#### Aggregations

Field-based aggregation — `function` is required:

| Function       | Description                |
|----------------|----------------------------|
| avg            | Average                    |
| count          | Count of rows              |
| count-distinct | Count of distinct values   |
| max            | Maximum value              |
| min            | Minimum value              |
| sum            | Sum                        |

```json
{"field_id": "t42-3", "function": "sum"}
```

For `count`, omit `field_id` (count operates on rows, not a specific field):

```json
{"function": "count"}
```

To sort by an aggregation result, use `sort_order` on the aggregation itself
(not `order_by`):

```json
{"field_id": "t42-3", "function": "sum", "sort_order": "desc"}
```

Measure-based aggregation — uses a pre-defined measure:

```json
{"measure_id": 5, "sort_order": "asc"}
```

#### Group by

```json
{"field_id": "t42-5", "field_granularity": "month"}
```

`field_granularity` is optional and controls temporal grouping granularity.
Valid values: `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`,
`day-of-week`. Note: this is a smaller set than the `bucket` field on
filters, which also accepts extraction units like `day-of-month` and
`hour-of-day`.

#### Order by

Order by a field (not an aggregation — use `sort_order` for that):

```json
{"field": {"field_id": "t42-1"}, "direction": "desc"}
```

### POST /v1/execute

Execute a query returned by /v1/construct-query.

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
- Default: 100 rows (applied when no `limit` is specified in construct-query for tables)
- Simple queries (no aggregation): 2000 rows max
- Aggregated queries: 10000 rows max

## Typical workflow

1. **Search** — POST /v1/search to find relevant tables or metrics
2. **Inspect** — GET /v1/table/{id} or /v1/metric/{id} to get field IDs and
   understand the schema
3. **Explore field values** — GET /v1/table/{id}/field/{field-id}/values if
   you need to know valid filter values or field statistics
4. **Build query** — POST /v1/construct-query with filters, aggregations,
   group_by, etc.
5. **Execute** — POST /v1/execute with the base64-encoded query
6. **Iterate** — Adjust filters/aggregations and repeat steps 4-5

## Error handling

| HTTP Status | Meaning                                  |
|-------------|------------------------------------------|
| 200         | Success (GET endpoints, construct-query) |
| 202         | Success (execute — streaming response)   |
| 401         | Authentication failure                   |
| 403         | Insufficient permissions                 |
| 404         | Entity not found                         |

---

# Workspace API

The Workspace API provides endpoints for managing data workspaces — isolated
environments for building and running data transforms (ETL pipelines).

Requires the `workspaces` Metabase Pro/Enterprise feature.

## Workspace status

| Status          | Description                                  |
|-----------------|----------------------------------------------|
| uninitialized   | Workspace created but database not set up    |
| pending         | Database setup in progress                   |
| ready           | Workspace is ready for use                   |
| broken          | Workspace encountered an error during setup  |
| archived        | Workspace has been archived                  |

## Read endpoints

### GET /v1/workspace/{ws-id}

Get a single workspace by ID.

**Scope**: `agent:workspace:read`

Response:

```json
{
  "id": 1,
  "name": "Revenue Analysis",
  "collection_id": 42,
  "database_id": 5,
  "status": "ready",
  "created_at": "2024-06-01T10:00:00Z",
  "updated_at": "2024-06-15T14:30:00Z"
}
```

### GET /v1/workspace/{ws-id}/table

Get workspace input and output tables.

**Scope**: `agent:workspace:read`

Response:

```json
{
  "inputs": [
    {"db_id": 1, "schema": "PUBLIC", "table": "ORDERS", "table_id": 42}
  ],
  "outputs": [
    {
      "db_id": 5,
      "global": {
        "transform_id": 10,
        "schema": "PUBLIC",
        "table": "DAILY_REVENUE",
        "table_id": 100
      },
      "isolated": {
        "transform_id": "tx-abc123",
        "schema": "mb__isolation_ws_1",
        "table": "DAILY_REVENUE",
        "table_id": 101
      }
    }
  ]
}
```

### GET /v1/workspace/{ws-id}/log

Get workspace creation status and recent log entries (up to 20).

**Scope**: `agent:workspace:read`

Response:

```json
{
  "workspace_id": 1,
  "status": "ready",
  "updated_at": "2024-06-15T14:30:00Z",
  "last_completed_at": "2024-06-15T14:30:00Z",
  "logs": [
    {
      "id": 1,
      "task": "setup",
      "description": "Creating isolated database schema",
      "started_at": "2024-06-01T10:00:00Z",
      "updated_at": "2024-06-01T10:01:00Z",
      "completed_at": "2024-06-01T10:01:00Z",
      "status": "completed",
      "message": null
    }
  ]
}
```

### GET /v1/workspace/{ws-id}/graph

Get the dependency graph for a workspace.

**Scope**: `agent:workspace:read`

Response:

```json
{
  "nodes": [
    {
      "id": 42,
      "type": "input-table",
      "dependents_count": {"workspace-transform": 1},
      "data": {"table": "ORDERS", "schema": "PUBLIC"}
    },
    {
      "id": "tx-abc123",
      "type": "workspace-transform",
      "dependents_count": {},
      "data": {"name": "Daily Revenue"}
    }
  ],
  "edges": [
    {
      "from_entity_id": 42,
      "from_entity_type": "input-table",
      "to_entity_id": "tx-abc123",
      "to_entity_type": "workspace-transform"
    }
  ]
}
```

### GET /v1/workspace/{ws-id}/problem

Detect problems in the workspace (stale transforms, cycles, failures, etc.).

**Scope**: `agent:workspace:read`

Response:

```json
[
  {
    "category": "internal",
    "problem": "stale",
    "severity": "warning",
    "block_merge": false,
    "data": {"transform_ref_id": "tx-abc123"}
  }
]
```

| Field       | Description                                                  |
|-------------|--------------------------------------------------------------|
| category    | `unused`, `internal-downstream`, `external-downstream`,      |
|             | `internal`, or `external`                                    |
| problem     | Problem type (e.g., `not-run`, `stale`, `failed`)            |
| severity    | `error`, `warning`, or `info`                                |
| block_merge | Whether this problem prevents merging to production          |

### GET /v1/workspace/{ws-id}/external/transform

List external (global) transforms not checked out into this workspace.

**Scope**: `agent:workspace:read`

Query parameters:

| Parameter   | Type    | Required | Description                    |
|-------------|---------|----------|--------------------------------|
| database-id | integer | No       | Filter by specific database ID |

Response:

```json
{
  "transforms": [
    {
      "id": 10,
      "name": "Daily Revenue",
      "source_type": "python",
      "checkout_disabled": null
    }
  ]
}
```

`checkout_disabled` is non-null (e.g., `"mbql"`, `"card-reference"`) when the
transform cannot be added to a workspace.

### GET /v1/workspace/{ws-id}/input/pending

List input tables that haven't been granted access yet.

**Scope**: `agent:workspace:read`

Response:

```json
{
  "inputs": [
    {"db_id": 1, "schema": "PUBLIC", "table": "CUSTOMERS"}
  ]
}
```

### GET /v1/workspace/{ws-id}/transform

List all transforms in a workspace.

**Scope**: `agent:workspace:read`

Response:

```json
{
  "transforms": [
    {
      "ref_id": "tx-abc123",
      "global_id": 10,
      "name": "Daily Revenue",
      "source_type": "python",
      "creator_id": 1
    }
  ]
}
```

### GET /v1/workspace/{ws-id}/transform/{tx-id}

Get full details for a specific transform.

**Scope**: `agent:workspace:read`

Response:

```json
{
  "ref_id": "tx-abc123",
  "global_id": 10,
  "name": "Daily Revenue",
  "description": "Aggregate daily revenue from orders",
  "source": {"type": "python", "code": "..."},
  "target": {"type": "table", "schema": "PUBLIC", "name": "DAILY_REVENUE"},
  "target_stale": false,
  "workspace_id": 1,
  "creator_id": 1,
  "archived_at": null,
  "created_at": "2024-06-01T10:00:00Z",
  "updated_at": "2024-06-15T14:30:00Z",
  "last_run_at": "2024-06-15T14:30:00Z",
  "last_run_status": "succeeded",
  "last_run_message": null
}
```

## Write endpoints

### POST /v1/workspace/{ws-id}/archive

Archive a workspace.

**Scope**: `agent:workspace:write`

Request body: empty.

Response: the archived workspace object (same schema as GET /v1/workspace/{ws-id}).

### POST /v1/workspace/{ws-id}/transform

Create a new transform in the workspace.

**Scope**: `agent:workspace:write`

Request:

```json
{
  "name": "Daily Revenue",
  "description": "Aggregate daily revenue from orders",
  "source": {"type": "python", "code": "..."}
}
```

| Field       | Type   | Required | Description                   |
|-------------|--------|----------|-------------------------------|
| name        | string | Yes      | Transform name                |
| description | string | No       | Transform description         |
| source      | object | Yes      | Transform source (see below)  |

Response: the created transform (same schema as GET /v1/workspace/{ws-id}/transform/{tx-id}).

### PUT /v1/workspace/{ws-id}/transform/{tx-id}

Update an existing transform, or create one with the given ref_id if it does
not exist.

**Scope**: `agent:workspace:write`

Request (all fields optional for updates):

```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "source": {"type": "python", "code": "..."},
  "target": {"type": "table", "schema": "PUBLIC", "name": "DAILY_REVENUE"}
}
```

Response: the updated transform (same schema as GET /v1/workspace/{ws-id}/transform/{tx-id}).

### POST /v1/workspace/{ws-id}/transform/{tx-id}/archive

Mark a transform for archival.

**Scope**: `agent:workspace:write`

Request body: empty.

Response: 204 No Content.

### POST /v1/workspace/{ws-id}/transform/{tx-id}/unarchive

Restore an archived transform.

**Scope**: `agent:workspace:write`

Request body: empty.

Response: 204 No Content.

### DELETE /v1/workspace/{ws-id}/transform/{tx-id}

Permanently delete a transform from the workspace.

**Scope**: `agent:workspace:write`

Response: 204 No Content.

### POST /v1/workspace/{ws-id}/transform/validate/target

Validate a target table configuration for a transform.

**Scope**: `agent:workspace:write`

Query parameters:

| Parameter    | Type   | Required | Description                                  |
|--------------|--------|----------|----------------------------------------------|
| transform-id | string | No       | Transform ref_id to exclude from conflict check |

Request:

```json
{
  "target": {
    "type": "table",
    "schema": "PUBLIC",
    "name": "DAILY_REVENUE"
  }
}
```

Response (200 if valid):

```json
{"status": 200, "body": "OK"}
```

Response (403 if invalid):

```json
{"status": 403, "body": "Unsupported target type"}
```

## Execute endpoints

### POST /v1/workspace/{ws-id}/run

Execute all transforms in the workspace in dependency order.

**Scope**: `agent:workspace:execute`

Request:

```json
{"stale_only": true}
```

| Field      | Type    | Required | Description                              |
|------------|---------|----------|------------------------------------------|
| stale_only | boolean | No       | Only run stale transforms (default false) |

Response:

```json
{
  "succeeded": ["tx-abc123", "tx-def456"],
  "failed": [],
  "not_run": []
}
```

### POST /v1/workspace/{ws-id}/transform/{tx-id}/run

Run a single transform.

**Scope**: `agent:workspace:execute`

Request:

```json
{"run_stale_ancestors": true}
```

| Field               | Type    | Required | Description                                   |
|---------------------|---------|----------|-----------------------------------------------|
| run_stale_ancestors | boolean | No       | Run stale ancestor transforms first            |

Response:

```json
{
  "status": "succeeded",
  "start_time": "2024-06-15T14:30:00Z",
  "end_time": "2024-06-15T14:30:05Z",
  "message": null,
  "table": {"name": "DAILY_REVENUE", "schema": "PUBLIC"},
  "ancestors": {"succeeded": [], "failed": [], "not_run": []}
}
```

### POST /v1/workspace/{ws-id}/transform/{tx-id}/dry-run

Dry-run a transform — execute the query without persisting to the target table.

**Scope**: `agent:workspace:execute`

Request:

```json
{"run_stale_ancestors": true}
```

Response:

```json
{
  "status": "succeeded",
  "message": null,
  "running_time": 142,
  "started_at": "2024-06-15T14:30:00Z",
  "data": {
    "cols": [
      {"name": "DATE", "base_type": "type/Date"},
      {"name": "REVENUE", "base_type": "type/Float"}
    ],
    "rows": [
      ["2024-06-01", 15234.50],
      ["2024-06-02", 18102.75]
    ]
  }
}
```

### POST /v1/workspace/{ws-id}/query

Execute an ad-hoc SQL query in the workspace's isolated database context.

**Scope**: `agent:workspace:execute`

Request:

```json
{"sql": "SELECT * FROM daily_revenue LIMIT 10"}
```

| Field | Type   | Required | Description          |
|-------|--------|----------|----------------------|
| sql   | string | Yes      | SQL query to execute |

Response: same format as dry-run (query result with status, data, cols, rows).
