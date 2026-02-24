# Product Analytics Event Ingestion — Implementation Roadmap

This document describes the phased plan for adding a first-party product analytics
event ingestion pipeline to Metabase as an enterprise feature. The design mirrors
Umami's event-receiving and postprocessing pipeline, adapted to Metabase's
architecture and gated behind a premium feature flag.

Events are stored in the app DB by default, but the storage layer is behind a
protocol so it can be swapped for an S3-hosted Iceberg datalake, a stream
adapter (Kafka, Kinesis, etc.), or other backends without changing the
ingestion or processing code.

---

## Phase 0 — Feature flag and skeleton module [DONE]

Create the enterprise module scaffolding with no real functionality yet. This
establishes the namespace structure, premium feature gate, and empty API routes
so subsequent phases can be developed and merged independently.

**Deliverables:**

- New premium feature keyword (e.g. `:product-analytics`).
- Enterprise module directory: `enterprise/backend/src/metabase_enterprise/product_analytics/`.
- Empty API namespace with `routes` var wired into `api_routes/routes.clj` under
  `/api/ee/product-analytics/`, gated by the new feature flag.
- Placeholder test namespace confirming the 402 without a token and 404 with one.

---

## Phase 1 — Data model, migrations, and virtual database [DONE]

Define the app DB tables and Toucan 2 models that store analytics configuration
and raw events, plus the virtual Database record that exposes them through
Metabase's permission system. This follows the same pattern as the Instance
Analytics audit DB.

**Tables:**

| Table | Purpose |
|---|---|
| `product_analytics_site` | Registered site/app (≈ Umami `website`). Owns a UUID used in the tracking snippet. Has a name, allowed-domains list, and created/updated timestamps. |
| `product_analytics_session` | Visitor session, keyed by a deterministic hash. Stores parsed browser, OS, device, screen, language, and geo fields. |
| `product_analytics_event` | Individual pageview or custom event. References a session and site. Stores url_path, url_query, referrer fields, UTM params, click IDs, event_name, event_type, page_title. |
| `product_analytics_event_data` | Flattened key/value rows for custom event properties. One row per key, with typed value columns (string, numeric, date) and a type discriminator. |

**Virtual Database (audit pattern):**

- A `Database` record with a well-known hardcoded ID and a marker flag (like
  `is_audit`) that routes queries back to the app DB connection.
- SQL views (`v_pa_events`, `v_pa_sessions`, etc.) expose the underlying tables
  in a read-friendly shape for the query builder.
- Permissions are gated by access to a dedicated collection (similar to the
  Instance Analytics `"analytics"` namespace collection). Direct DB permission
  edits are blocked — access is controlled through the collection grant.
- An allowlist restricts queries to the `v_pa_*` views only; native queries
  against the virtual DB are blocked.

**Deliverables:**

- Liquibase migration YAML creating the four tables with indexes.
- Liquibase migration creating the `v_pa_*` views (per-engine SQL files).
- Toucan 2 model namespaces (`site.clj`, `session.clj`, `event.clj`, `event_data.clj`)
  with `table-name`, `deftransforms`, and appropriate `derive` declarations.
- Startup function that ensures the virtual Database record and associated
  collection exist (idempotent, like `ensure-audit-db-installed!`).
- Permission check middleware that gates queries to the virtual DB behind
  collection access and the view allowlist.
- Unit tests confirming model round-trips (insert + select) and permission
  enforcement.

---

## Phase 2 — Storage protocol and app-DB implementation [DONE]

Introduce an abstraction layer between the event processing pipeline and the
persistence backend. The app-DB adapter is the default (and only) implementation
at this stage.

**Design:**

- Multimethods dispatching on a namespaced storage-backend keyword (e.g.
  `:product-analytics.storage/app-db`, `:product-analytics.storage/iceberg`,
  `:product-analytics.storage/stream`):
  - `upsert-session!` — insert or update a session row.
  - `save-event!` — write an event row and its associated event-data rows.
  - `get-site` — look up a site by UUID.
- The active backend keyword is read from an application setting
  (default: `:app-db`).
- The app-DB `defmethod` implementations call Toucan 2 directly.

New backends are added by requiring a namespace that defines `defmethod`
implementations for the backend keyword — no protocol reification needed.

**Deliverables:**

- `storage.clj` — multimethod definitions and dispatch function.
- `storage/app_db.clj` — `defmethod` implementations backed by the Phase 1 models.
- Tests exercising the protocol through the app-DB backend.

---

## Phase 3 — Site management CRUD API

Expose endpoints for creating, listing, updating, and deleting analytics sites.
These are authenticated admin-only endpoints. This phase comes before the event
pipeline because the CRUD endpoints are simpler and provide the site records that
the pipeline and HTTP endpoint depend on for site lookup and CORS configuration.

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ee/product-analytics/sites` | List all registered sites. |
| `POST` | `/api/ee/product-analytics/sites` | Create a new site (returns UUID + snippet). |
| `GET` | `/api/ee/product-analytics/sites/:id` | Get site details. |
| `PUT` | `/api/ee/product-analytics/sites/:id` | Update site settings. |
| `DELETE` | `/api/ee/product-analytics/sites/:id` | Soft-delete a site. |

**Deliverables:**

- CRUD endpoint definitions gated behind admin permissions.
- Tracking snippet generation (returns the `<script>` tag with the site UUID
  and the Metabase host URL).
- API tests for each endpoint, including permission checks.

---

## Phase 4 — User identification and session data

Add support for Umami's user identification flow: distinct IDs that tie sessions
together across devices and time, the `identify` payload type for attaching
arbitrary session-level attributes, and the session cache JWT that lets clients
skip server-side session resolution on repeat hits.

Since Phase 1 is already complete, these are additive schema changes (new
migration changeset) plus new model and storage-protocol work.

**Schema additions (new Liquibase migration):**

| Change | Detail |
|---|---|
| `product_analytics_session.distinct_id` | `VARCHAR(50)`, nullable. Operator-supplied user identifier set via `umami.identify(id)` or the `id` payload field. Indexed for lookup. |
| `product_analytics_session_data` (new table) | Stores arbitrary key/value attributes from `umami.identify(id, data)`. One row per key, with typed value columns mirroring `product_analytics_event_data`: `session_id` (FK), `data_key`, `string_value`, `number_value`, `date_value`, `data_type`. |
| `v_pa_sessions` view | Recreated to include `distinct_id`. |
| `v_pa_session_data` view (new) | Exposes `product_analytics_session_data` through the virtual DB. |

**Session cache JWT:**

The `/send` endpoint (Phase 6) will return a short-lived JWT so the client can
skip the hash-based session resolution on subsequent requests. The token and
verification logic are built in this phase so they are ready when the HTTP
endpoint lands.

- **Payload:** `{sessionId, visitId, websiteId}`.
- **Signing:** HMAC-SHA256 using a dedicated `product-analytics-session-secret`
  application setting. Falls back to `MB_ENCRYPTION_SECRET_KEY` if unset.
- **Expiry:** 24 hours. The client refreshes it on each `/send` response.
- **Validation:** When the client sends the token back (via an `x-umami-cache`
  header or cookie), the server verifies the signature and expiry, then uses
  the embedded session/visit IDs directly instead of re-hashing.

**Storage protocol additions (extend Phase 2 multimethods):**

- `save-session-data!` — upsert key/value session attributes.
- `set-distinct-id!` — associate a distinct ID with a session.
- App-DB implementations call Toucan 2 against the new table/column.

**Toucan 2 model:**

- `session_data.clj` — model for `product_analytics_session_data` with
  `table-name`, `deftransforms`, and `derive` declarations.

**Deliverables:**

- Liquibase migration adding `distinct_id` column, `product_analytics_session_data`
  table with indexes, and the new/updated SQL views.
- `session_data.clj` Toucan 2 model.
- `token.clj` — `create-session-token` and `verify-session-token` functions.
- Storage multimethod extensions (`save-session-data!`, `set-distinct-id!`) with
  app-DB implementations.
- Permission allowlist updated to include `v_pa_session_data`.
- Unit tests: model round-trips, token sign/verify (including expiry and
  tampered tokens), storage protocol, and permission enforcement.

---

## Phase 5 — Event postprocessing pipeline (core)

Build the server-side enrichment logic that transforms a raw inbound event
payload into a fully resolved event ready for storage. This phase has no HTTP
surface; it is a pure-function pipeline consumed by the API layer in Phase 6.

This phase handles only `type: "event"` payloads (pageviews and custom events).
Session cache shortcutting and `type: "identify"` payloads are added in
Phase 5.5 after Phase 4 lands.

**Processing steps (mirroring Umami):**

1. **Payload validation** — enforce field presence and length limits.
2. **Site lookup** — resolve the site UUID, reject if missing or inactive.
3. **Bot filtering** — drop requests whose User-Agent matches known bot patterns.
4. **Client-info extraction:**
   - Parse User-Agent → browser, OS, device type.
   - Derive geolocation from IP (MaxMind GeoLite2 or CDN headers).
   - IP is used for derivation only and never persisted.
5. **Session resolution** — deterministic UUID from `hash(site-id, ip, user-agent, monthly-salt)`.
   Salt rotates on the first of each month so cross-month correlation is impossible.
6. **Visit bucketing** — `hash(session-id, hourly-salt)` to segment activity windows.
7. **URL/referrer parsing** — extract path, query, domain, UTM params, click IDs.

**Deliverables:**

- `pipeline.clj` (or `pipeline/` directory) with a top-level `process-event`
  function that accepts a raw event payload + request context and returns a map
  ready for storage. The function signature should accept an optional
  `resolved-session` parameter (nil for now) so Phase 5.5 can pass in
  cache-resolved sessions without changing the interface.
- Individual processing step functions, each independently testable.
- Comprehensive unit tests for each step, including edge cases (missing fields,
  bot UAs, IPv6, malformed URLs).

---

## Phase 5.5 — Identify handling and session cache integration

Wire Phase 4's session cache JWT and identity/session-data storage into the
event pipeline from Phase 5. This phase depends on both Phase 4 and Phase 5.

**Additions to the pipeline:**

1. **Session cache check** — if a valid session cache JWT (from Phase 4) is
   present, extract the session and visit IDs directly and skip client-info
   extraction, session resolution, and visit bucketing.
2. **Identify handling** — support `type: "identify"` payloads. If the payload
   includes a distinct ID, call `set-distinct-id!`. If it includes `data`, call
   `save-session-data!`. Return early without creating an event row.
3. **Payload type dispatch** — wrap the pipeline entry point (`process-payload`)
   to dispatch on `type`: route `"event"` payloads through `process-event`
   (Phase 5) and `"identify"` payloads through the new identify handler.

**Deliverables:**

- Updated `pipeline.clj` with `process-payload` dispatcher and identify handler.
- Session cache check integrated before session resolution.
- Tests for identify payloads, distinct ID assignment, session data storage,
  and session cache shortcutting (valid token, expired token, tampered token).

---

## Phase 6 — Event-receiving HTTP endpoint

Wire the postprocessing pipeline to an HTTP endpoint that accepts events from
tracking scripts or server-side callers, and persists them through the storage
protocol.

**Endpoint:** `POST /api/ee/product-analytics/api/send`

- No authentication required (public endpoint, like Umami).
- Requires a valid `User-Agent` header.
- Accepts the same JSON shape as Umami's `/api/send`, including both
  `type: "event"` and `type: "identify"` payloads.
- Returns a session cache JWT (built in Phase 4) in a response header so clients
  can short-circuit session resolution on subsequent requests.
- Rate limiting / abuse mitigation (configurable per-site).

**CORS:**

The send endpoint will receive cross-origin requests from tracking scripts
running on external sites. Metabase's CORS configuration must be extended to
allow requests from the hostnames of configured product analytics sites. When
a site is created or its allowed-domains list is updated, the set of permitted
CORS origins must be updated accordingly.

**Deliverables:**

- `api.clj` — `defendpoint` for `POST /send` that orchestrates validation →
  pipeline → storage, dispatching on payload type.
- Session cache JWT returned in each response (using `token.clj` from Phase 4).
- CORS middleware/configuration that dynamically allows origins matching
  registered site hostnames for the `/send` endpoint.
- Integration tests hitting the endpoint end-to-end against the app-DB backend,
  including CORS preflight checks, event payloads, and identify payloads.

---

## Phase 6.5 — Lightweight event collector entrypoint [DONE]

Provide an alternative Metabase entrypoint that boots only the subsystems
required for event ingestion. This lets operators run a dedicated collector
process — smaller, faster to start, and independently scalable — separate from
the main Metabase instance that serves the UI and query workloads.

**Motivation:**

The full Metabase boot sequence initialises the task scheduler, queue
listeners, plugin loader, sample data, sync/scan infrastructure, the complete
API route tree, and the frontend static-asset handler. None of this is needed
to accept `/send` requests and write events to storage. A collector-only
process:

- Starts in seconds instead of tens of seconds.
- Uses a fraction of the memory (no query processor, no driver system).
- Can be horizontally scaled behind a load balancer independently of the
  Metabase UI nodes.
- Reduces blast radius — a traffic spike on the collector doesn't affect
  dashboard queries.

**What boots:**

| Subsystem | Why |
|---|---|
| Classloader | Required before anything else. |
| App DB connection + migrations | Storage backend and site config live here. |
| Settings cache | Reads storage-backend config, site allowed-domains, session secret. |
| Premium feature check | Gates the endpoint behind the `:product-analytics` token flag. |
| Product analytics storage layer | Multimethod dispatch to app-DB, Iceberg, or stream backend. |
| Iceberg flush scheduler (if Iceberg) | Background thread that flushes the event buffer. |

**What does NOT boot:**

Task scheduler, queue listeners, notification system, sync/scan, plugin
loader (beyond EE), analytics/telemetry, sample data, full API route tree,
frontend static assets, embedding middleware, session/auth middleware (the
`/send` endpoint is unauthenticated).

**Entrypoint design:**

A new namespace `metabase.core.collector` with a `-main` function, invocable
as a Metabase command (`java -jar metabase.jar collector`) or via an
environment variable (`MB_MODE=collector`). The startup sequence:

1. Initialise classloader.
2. Load EE plugins (product-analytics module only).
3. Set up app DB connection, run migrations.
4. Warm the settings cache.
5. Build a minimal Ring handler:
   - `POST /api/ee/product-analytics/api/send` — the Phase 6 endpoint.
   - `GET /api/health` — returns 200 when ready (for load-balancer probes).
   - `GET /livez` — liveness probe (no DB check).
   - CORS middleware scoped to registered site hostnames.
   - JSON body parsing, exception handling, request-id, gzip.
   - No session/auth middleware, no paging, no frontend routes.
6. Start Jetty on the configured port.
7. Register shutdown hook (flush Iceberg buffer, close DB pool).

**Middleware stack (minimal):**

```
wrap-gzip
wrap-request-id
bind-request
catch-uncaught-exceptions
catch-api-exceptions
log-api-call
wrap-json-body
wrap-streamed-json-response
wrap-keyword-params
wrap-params
add-content-type
add-version
```

No session, auth, paging, metadata-provider, browser-cookie, or
security-header middleware — none of it applies to a public event endpoint.

**Shared code:**

The collector reuses the same `defendpoint` handler from Phase 6 and the same
storage multimethod implementations from Phase 2/8/9. No duplication — the
only new code is the boot sequence and the minimal route/middleware assembly.

**Configuration:**

The collector reads the same application settings as the main process
(storage backend, Iceberg config, session secret for JWT verification). It
connects to the same app DB. The only new setting is:

| Setting | Default | Description |
|---|---|---|
| `mb-mode` | `full` | `full` (normal Metabase) or `collector` (event ingestion only). Also selectable via the `collector` command. |

**Deployment patterns:**

```
                  ┌─────────────────────┐
  Browser ──────> │  Load balancer      │
                  │  /api/ee/.../send   │──> collector (N replicas)
                  │  everything else    │──> metabase  (M replicas)
                  └─────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │     App DB        │
                    └───────────────────┘
```

Operators route `/api/ee/product-analytics/api/send` (and its CORS preflight) to
the collector pool, and all other traffic to the main Metabase pool. Both
pools share the app DB (and optionally the Iceberg catalog / S3 bucket).

**Deliverables:**

- `metabase.core.collector` namespace with `-main`, `start!`, and `destroy!`.
- Minimal Ring handler assembly (route + middleware).
- Registration as a Metabase command so `java -jar metabase.jar collector`
  works out of the box.
- `MB_MODE` environment variable support as an alternative to the command.
- Health and liveness endpoints.
- Documentation on the deployment pattern (load-balancer routing).
- Integration test that boots the collector, sends an event, and verifies
  storage.

---

## Phase 7 — Query builder integration

Surface stored product analytics events in Metabase's query builder so users
can build questions and dashboards against their event data without writing SQL.

**Areas to address:**

- How the virtual DB's `v_pa_*` views appear in the data picker (sync metadata
  from the views like any other database).
- Whether custom event properties (the key/value `event_data` rows) can be
  queried as if they were columns.
- Canned metrics / pre-built dashboards (pageviews over time, top pages,
  referrer breakdown, device/browser/geo splits).

**Deliverables:**

- Metadata sync for the virtual DB so views are browsable in the data picker.
- Pre-built questions/dashboards loaded into the product analytics collection
  at startup (serialization approach, like Instance Analytics).
- Tests confirming questions can be saved and executed against the views.

---

## Phase 8 — Iceberg datalake storage backend

Implement the storage multimethod for Apache Iceberg, writing events as Parquet
files to an S3-hosted datalake. This is the first alternative backend and
validates that the Phase 2 abstraction works in practice. Once data lands in
Iceberg, operators can query it through any engine that speaks Iceberg (Trino,
Spark, Athena, StarRocks, or Metabase itself via a warehouse connection).

### Write path

Iceberg does not support single-row inserts. The backend buffers events
in-memory and flushes them as Parquet batches on a configurable schedule:

- `save-event!` appends the processed event to an in-memory buffer (a
  `ConcurrentLinkedQueue` or similar).
- A background scheduled task flushes the buffer every N seconds (default: 30)
  or when the buffer reaches M events (default: 1000), whichever comes first.
- Each flush writes one Parquet data file and commits it to the Iceberg table
  as a single append snapshot.
- On JVM shutdown a shutdown hook drains any remaining buffered events.

Session handling: sessions are written as append-only rows. Downstream queries
deduplicate by `session_id` + latest timestamp, or an Iceberg merge-on-read
view handles it. This avoids expensive upsert patterns (equality deletes /
copy-on-write rewrites) on a high-write table.

### Storage protocol changes

The buffered write model means `save-event!` returns before data is durable in
Iceberg. To support this:

- `save-event!` is documented as "at least once, eventually durable" for
  backends that buffer. The app-DB backend remains synchronous.
- A new `flush!` multimethod is added. The app-DB backend no-ops; the Iceberg
  backend forces an immediate flush. Used in tests and graceful shutdown.

### Iceberg catalog

The catalog tracks table metadata (which Parquet files belong to which
snapshots, schema evolution, partition specs). The catalog type is configurable
via an application setting, with the JDBC catalog as the default.

| Catalog | Pros | Cons | Config |
|---|---|---|---|
| **JDBC** (default) | Zero extra infra — uses Metabase's app DB as the catalog store. Supports concurrent writers safely via row-level locking. Simplest path to production. | Adds catalog tables to the app DB. Slight write contention under very high flush rates. | Just the S3 bucket — catalog connection is derived from the app DB. |
| **REST** | Standard interface supported by AWS Glue, Tabular, Polaris, Unity Catalog. Best for orgs already running a catalog service. Decouples catalog from app DB. | Requires external infra. Each provider has its own auth story. | Catalog URI + auth credentials. |
| **Hadoop** | Simplest possible setup — catalog metadata is just files in S3 alongside the data. No server component at all. | No locking — unsafe with concurrent writers (only safe for single-node Metabase). No atomic rename on S3 without a lock manager. | S3 path only. |
| **Glue** | Native AWS integration. No separate catalog server if you're already on AWS. | AWS-only. IAM permissions can be complex. Glue API rate limits under high commit rates. | AWS region + optional database name. |

**Recommended default: JDBC.** It requires no additional infrastructure, reuses
the existing app DB connection, and handles concurrent writers correctly. The
catalog creates a small set of metadata tables (`iceberg_tables`,
`iceberg_namespace_properties`) in the app DB schema — these are lightweight
and do not grow with event volume.

Operators who already run a REST catalog or Glue can switch by changing a single
application setting and providing the appropriate connection details.

### Iceberg table schema

| Table | Partition | Notes |
|---|---|---|
| `pa_events` | `day(event_time), site_id` | Main event table. Custom event properties stored as a `Map<String, String>` column rather than the flattened `event_data` rows used in the app DB. |
| `pa_sessions` | `day(created_at)` | Append-only; deduplicate on read by `session_id` + latest `updated_at`. |

Using a map column for event data is cleaner than the relational
`product_analytics_event_data` table and is well-supported by Iceberg and
downstream query engines.

### Query integration

When an operator configures the Iceberg backend and also has a warehouse
connection (Trino, Athena, Spark, etc.) that can read the same Iceberg tables,
Phase 7 (query builder integration) can detect this and route queries through
the warehouse instead of the virtual DB views. This gives operators full
SQL engine performance for analytics queries.

### Configuration

Application settings (all under a `product-analytics-iceberg-` prefix):

| Setting | Default | Description |
|---|---|---|
| `catalog-type` | `jdbc` | One of `jdbc`, `rest`, `hadoop`, `glue`. |
| `s3-bucket` | *(required)* | S3 bucket name. |
| `s3-prefix` | `product-analytics/` | Key prefix for Parquet data files. |
| `s3-endpoint` | *(none)* | Custom S3 endpoint URL. Set to `http://localhost:3900` for Garage in local dev. Omit for real AWS S3. |
| `catalog-uri` | *(derived from app DB for jdbc)* | REST catalog URI, or Glue region. |
| `catalog-credentials` | *(none)* | Auth for REST/Glue catalogs. Not needed for JDBC. |
| `flush-interval-seconds` | `30` | Max seconds between flushes. |
| `flush-batch-size` | `1000` | Max buffered events before forcing a flush. |
| `aws-region` | *(from env)* | AWS region for S3. Falls back to `AWS_REGION` env var / instance metadata. |
| `aws-credentials` | *(from env)* | Explicit key/secret, or omit to use instance profile / environment. |

### Dependencies

- `org.apache.iceberg/iceberg-core` — table API, catalog interfaces.
- `org.apache.iceberg/iceberg-parquet` — Parquet file read/write.
- `org.apache.iceberg/iceberg-aws` — S3 `FileIO` and Glue catalog.
- `software.amazon.awssdk/s3` — S3 client.

These add ~50-80 MB of JARs. This backend should be packaged as an enterprise
plugin/module rather than bundled in core, loaded only when the Iceberg storage
backend is selected.

### Local development setup

No AWS account is needed for local development. Use
[Garage](https://garagehq.deuxfleurs.fr/) (AGPLv3, Rust-based) as an
S3-compatible object store and the JDBC catalog backed by the app DB.

1. **Write a Garage config** (`dev/garage.toml`):

   ```toml
   metadata_dir = "/var/lib/garage/meta"
   data_dir = "/var/lib/garage/data"
   db_engine = "sqlite"
   replication_factor = 1

   [rpc]
   bind_addr = "[::]:3901"
   rpc_secret = "$(openssl rand -hex 32)"

   [s3_api]
   s3_region = "garage"
   api_bind_addr = "[::]:3900"

   [admin]
   api_bind_addr = "[::]:3903"
   admin_token = "admin"
   ```

2. **Start Garage:**

   ```bash
   docker run -d --name garage \
     -p 3900:3900 -p 3903:3903 \
     -v $(pwd)/dev/garage.toml:/etc/garage.toml \
     dxflrs/garage:v2.2.0
   ```

3. **Create a bucket and access key** (run inside the container):

   ```bash
   docker exec garage /garage bucket create product-analytics
   docker exec garage /garage key create pa-dev-key
   # Note the Key ID and Secret Key from the output, then:
   docker exec garage /garage bucket allow \
     --read --write --owner product-analytics --key pa-dev-key
   ```

4. **Configure Metabase** (REPL or env vars):

   ```clojure
   (setting/set! :product-analytics-storage-backend "iceberg")
   (setting/set! :product-analytics-iceberg-catalog-type "jdbc")
   (setting/set! :product-analytics-iceberg-s3-bucket "product-analytics")
   (setting/set! :product-analytics-iceberg-s3-prefix "events/")
   (setting/set! :product-analytics-iceberg-s3-endpoint "http://localhost:3900")
   (setting/set! :product-analytics-iceberg-aws-region "garage")
   (setting/set! :product-analytics-iceberg-aws-access-key "<Key ID from step 3>")
   (setting/set! :product-analytics-iceberg-aws-secret-key "<Secret Key from step 3>")
   ```

   The JDBC catalog auto-creates its metadata tables (`iceberg_tables`,
   `iceberg_namespace_properties`) in the app DB on first use.

5. **Verify data landed** after sending events and flushing:

   ```bash
   # Using the AWS CLI pointed at Garage
   aws --endpoint-url http://localhost:3900 s3 ls s3://product-analytics/events/ --recursive
   ```

6. **(Optional) Query with Trino** to test the full warehouse query path:

   ```bash
   docker run -d --name trino -p 8080:8080 trinodb/trino
   ```

   Add a catalog config pointing Trino at the JDBC catalog and Garage, then
   connect Metabase to Trino as a warehouse to query the Iceberg tables.

### CI testing

Integration tests use Docker (Testcontainers or compose) to spin up Garage and
use the H2 in-memory app DB as the JDBC catalog. No AWS credentials required.
The test lifecycle is:

1. Start Garage container, create bucket and access key.
2. Initialize Iceberg backend with JDBC catalog pointed at the test app DB.
3. Send events through the pipeline, call `flush!`.
4. Assert Parquet files exist in Garage and catalog tables are populated.
5. Tear down containers.

### Deliverables

- `storage/iceberg.clj` — multimethod implementations for `:product-analytics.storage/iceberg`.
- `storage/iceberg/catalog.clj` — catalog factory that builds the appropriate
  `org.apache.iceberg.catalog.Catalog` instance based on the `catalog-type` setting.
- `storage/iceberg/buffer.clj` — in-memory event buffer with scheduled flush.
- `storage/iceberg/schema.clj` — Iceberg `Schema` and `PartitionSpec` definitions.
- Table auto-creation on first flush (idempotent `createTable` if not exists).
- `dev/garage.toml` — Garage config for local development.
- Integration tests against Garage + JDBC catalog (Docker in CI).
- Unit tests for buffer flush logic, catalog factory, and schema mapping.

---

## Phase 9 — Stream storage backend (optional/plugin)

Implement the storage multimethod as a write-to-stream adapter. Events are
serialized and published to a message stream for downstream consumers to
ingest into their own warehouse.

**Supported targets (pick one to start, add others later):**

- Kafka
- AWS Kinesis
- Generic webhook (POST to a configured URL)

**Deliverables:**

- `storage/stream.clj` — protocol implementation for the chosen target.
- Serialization format (JSON or Avro, configurable).
- Integration test with an embedded/mock broker.

---

## Phase 10 — ClickHouse storage backend (optional/plugin, deprioritized)

Implement the storage multimethod for ClickHouse. Lower priority than the
Iceberg backend since Iceberg tables can already be queried by ClickHouse
via its Iceberg table engine.

**Considerations:**

- ClickHouse favors append-only inserts; session upserts need to use
  `ReplacingMergeTree` or a separate session-state approach.
- Event data can leverage ClickHouse's native `Map(String, String)` column type
  or a `Nested` structure instead of the flattened rows used in the app DB.
- Connection config lives in Metabase's application settings (not a warehouse
  connection — this is infrastructure config).
- Operators who need ClickHouse performance may be better served by the Iceberg
  backend + ClickHouse's Iceberg table engine, avoiding a separate write path.

**Deliverables:**

- `storage/clickhouse.clj` — protocol implementation.
- ClickHouse table DDL (managed outside Liquibase; possibly an init script the
  backend runs on first connection).
- Integration tests against a real ClickHouse instance (Docker in CI).

---

## Dependency graph

```
Phase 0  (skeleton)
  │
  v
Phase 1  (data model + virtual DB)
  │
  v
Phase 2  (storage multimethods)
  │
  v
Phase 3  (site CRUD)
  │
  ├──────────────────────────┐
  v                          v
Phase 4  (identification +   Phase 5  (pipeline core)
          session data +       │
          cache JWT)           │
  │                          │
  └──────────┬───────────────┘
             v
Phase 5.5  (identify handling + session cache integration)
  │
  v
Phase 6  (HTTP endpoint)
  │
  ├──────────────────────────┐
  v                          v
Phase 6.5 (collector       Phase 7  (query integration)
           entrypoint)

Phase 8  (Iceberg)     ── depends on Phase 2
Phase 9  (Stream)      ── depends on Phase 2
Phase 10 (ClickHouse)  ── depends on Phase 2 (deprioritized)
```

### Parallelism opportunities

After Phase 3 completes, the following work streams can proceed in parallel:

| Stream | Phases | Notes |
|---|---|---|
| **Identity + session data** | Phase 4 | Schema, JWT, storage extensions. Can run in parallel with Phase 5. |
| **Event pipeline (core)** | Phase 5 | Pure-function pipeline for event payloads. Can run in parallel with Phase 4. |
| **Collector entrypoint** | Phase 6.5 | Minimal boot for event ingestion. Requires Phase 6 endpoint code to exist. Independent of Phase 7. |
| **Iceberg backend** | Phase 8 | Primary alternative backend. Independent of Phases 3–7; can start any time after Phase 2. |
| **Stream / ClickHouse** | Phase 9, 10 | Lower priority. Independent of all other backend phases. |

Phase 5.5 merges the two streams and requires both Phase 4 and Phase 5 to be complete.
Phases 8, 9, and 10 are independent of each other and of Phases 3–7.

---

## Decisions

| Topic | Decision |
|---|---|
| **Feature flag** | `:product-analytics` |
| **Geolocation** | Check CDN headers first (Cloudflare, Vercel, CloudFront). Fall back to a user-supplied MaxMind GeoLite2 DB file whose path is configured in application settings. No bundled DB. |
| **Rate limiting** | Deferred. Ship Phase 6 without rate limiting; add it as a fast follow once real traffic patterns are understood. |
| **Session salt rotation** | Monthly, same as Umami. Salt rotates on the 1st of each calendar month. |
| **Retention / TTL** | No automatic purge for now. Operators manage DB size themselves. Revisit when usage patterns are clearer. |
| **Table isolation** | Follow the audit DB pattern: tables live in the main schema with a `product_analytics_` prefix, exposed via `v_pa_*` SQL views through a virtual Database record. Permissions are gated by a dedicated collection, not direct DB grants. |
| **Tracker script** | None. The `/send` endpoint is API-compatible with Umami, so operators use Umami's tracker script from a CDN (or self-hosted) pointed at Metabase's endpoint. |
| **Iceberg catalog** | Configurable. JDBC catalog (using the app DB) is the default — zero extra infra. REST and Glue catalogs supported for orgs with existing catalog infrastructure. Hadoop catalog supported but not recommended for multi-node deployments (no locking). |
| **User identification** | Umami-compatible. Support `type: "identify"` payloads, distinct IDs (max 50 chars) on sessions, and arbitrary session-level key/value attributes. Session cache uses a short-lived HMAC-SHA256 JWT (24h expiry). |
| **Query integration** | Phase 7, after the ingestion pipeline is complete and before alternative storage backends. |
