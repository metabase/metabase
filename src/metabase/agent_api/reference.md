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
  inspect a metric's dimensions, and POST /v1/construct-query with a program
  to query one.
- **Measures**: Lightweight, reusable aggregation expressions (e.g.,
  `SUM(total)`) associated with a specific table. Unlike metrics, measures are
  not standalone queries — they are building blocks that can be referenced in
  table queries via `measure_id` in the aggregations array. Discover available
  measures for a table via GET /v1/table/{id}?with-measures=true.
- **Segments**: Pre-defined filter conditions (e.g., "Active Users") that can
  be applied to queries by passing `{"segment_id": id}` in the filters array.
- **Field IDs**: Integer identifiers for database columns. These are the real
  database field IDs returned by the table/metric detail endpoints. Use them
  as the `field_id` value in filters, aggregations, group_by, and order_by
  entries when constructing queries.

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

### POST /v1/construct-query

Construct a query using a structured program. Returns a base64-encoded query
to pass to /v1/execute.

**Important**: Field IDs used in operations must come from the detail endpoints
(/v1/table/{id} or /v1/metric/{id}). Always fetch entity details first.

The request uses a program format with a source and an array of operations.
Each operation is an array: `["operation-name", arg1, arg2, ...]`.

#### Request format

```json
{
  "table_id": 42,
  "filters": [
    {"field_id": "302", "operation": "greater-than", "value": 100}
  ],
  "aggregations": [
    {"function": "sum", "field_id": "302"}
  ],
  "group_by": [
    {"field_id": "305", "field_granularity": "month"}
  ],
  "order_by": [
    {"field": {"field_id": "302"}, "direction": "desc"}
  ],
  "limit": 100
}
```

Or for metrics:

```json
{
  "metric_id": 10,
  "filters": [
    {"field_id": "305", "operation": "greater-than", "value": "2024-01-01"}
  ],
  "group_by": [
    {"field_id": "305", "field_granularity": "month"}
  ]
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
{"field_id": "301", "operation": "is-not-null"}
```

**Comparison filters** — single value:

| Operation             | Description                     |
|-----------------------|---------------------------------|
| equals                | Equals value                    |
| not-equals            | Does not equal value            |
| greater-than          | Greater than                    |
| greater-than-or-equal | Greater than or equal           |
| less-than             | Less than                       |
| less-than-or-equal    | Less than or equal              |

```json
{"field_id": "302", "operation": "greater-than", "value": 100}
```

For multiple values, use `values` (array) instead of `value`:

```json
{"field_id": "302", "operation": "equals", "values": [10, 20, 30]}
```

**String filters**:

| Operation           | Description                          |
|---------------------|--------------------------------------|
| string-contains     | Contains substring                   |
| string-not-contains | Does not contain substring           |
| string-starts-with  | Starts with prefix                   |
| string-ends-with    | Ends with suffix                     |

```json
{"field_id": "303", "operation": "string-contains", "value": "acme"}
```

**Temporal filters** — optional `bucket` for temporal bucketing:

Truncation units: `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`.
Extraction units: `day-of-week`, `day-of-month`, `day-of-year`,
`week-of-year`, `month-of-year`, `quarter-of-year`, `hour-of-day`,
`minute-of-hour`, `second-of-minute`.

```json
{"field_id": "305", "operation": "greater-than", "value": "2024-01-01", "bucket": "day"}
```

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
{"field_id": "302", "function": "sum"}
```

For `count`, omit `field_id`:

```json
{"function": "count"}
```

Measure-based aggregation — uses a pre-defined measure:

```json
{"measure_id": 5}
```

#### Group by

```json
{"field_id": "305", "field_granularity": "month"}
```

`field_granularity` is optional. Valid values: `minute`, `hour`, `day`,
`week`, `month`, `quarter`, `year`, `day-of-week`.

#### Order by

```json
{"field": {"field_id": "302"}, "direction": "desc"}
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
