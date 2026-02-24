# Product Analytics Event Ingestion — Implementation Roadmap

This document describes the phased plan for adding a first-party product analytics
event ingestion pipeline to Metabase as an enterprise feature. The design mirrors
Umami's event-receiving and postprocessing pipeline, adapted to Metabase's
architecture and gated behind a premium feature flag.

Events are stored in the app DB by default, but the storage layer is behind a
protocol so it can be swapped for ClickHouse or a write-to-stream adapter
(Kafka, Kinesis, etc.) without changing the ingestion or processing code.

---

## Phase 0 — Feature flag and skeleton module

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

## Phase 1 — Data model, migrations, and virtual database

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

## Phase 2 — Storage protocol and app-DB implementation

Introduce an abstraction layer between the event processing pipeline and the
persistence backend. The app-DB adapter is the default (and only) implementation
at this stage.

**Design:**

- Multimethods dispatching on a namespaced storage-backend keyword (e.g.
  `:product-analytics.storage/app-db`, `:product-analytics.storage/clickhouse`,
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

## Phase 4 — Event postprocessing pipeline

Build the server-side enrichment logic that transforms a raw inbound payload into
a fully resolved event ready for storage. This phase has no HTTP surface; it is
a pure-function pipeline consumed by the API layer in Phase 5.

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

- `pipeline.clj` (or `pipeline/` directory) with a top-level `process-event` function
  that accepts a raw payload + request context and returns a map ready for storage.
- Individual processing step functions, each independently testable.
- Comprehensive unit tests for each step, including edge cases (missing fields,
  bot UAs, IPv6, malformed URLs).

---

## Phase 5 — Event-receiving HTTP endpoint

Wire the postprocessing pipeline to an HTTP endpoint that accepts events from
tracking scripts or server-side callers, and persists them through the storage
protocol.

**Endpoint:** `POST /api/ee/product-analytics/send`

- No authentication required (public endpoint, like Umami).
- Requires a valid `User-Agent` header.
- Accepts the same JSON shape as Umami's `/api/send`.
- Returns a session cache token in a response header so clients can short-circuit
  session resolution on subsequent requests.
- Rate limiting / abuse mitigation (configurable per-site).

**CORS:**

The send endpoint will receive cross-origin requests from tracking scripts
running on external sites. Metabase's CORS configuration must be extended to
allow requests from the hostnames of configured product analytics sites. When
a site is created or its allowed-domains list is updated, the set of permitted
CORS origins must be updated accordingly.

**Deliverables:**

- `api.clj` — `defendpoint` for `POST /send` that orchestrates validation →
  pipeline → storage.
- Session cache token generation and lookup (avoid re-deriving session on every hit).
- CORS middleware/configuration that dynamically allows origins matching
  registered site hostnames for the `/send` endpoint.
- Integration tests hitting the endpoint end-to-end against the app-DB backend,
  including CORS preflight checks.

---

## Phase 6 — Query builder integration

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

## Phase 7 — ClickHouse storage backend (optional/plugin)

Implement the storage multimethod for ClickHouse. This is the first alternative
backend and validates that the Phase 2 abstraction works in practice.

**Considerations:**

- ClickHouse favors append-only inserts; session upserts need to use
  `ReplacingMergeTree` or a separate session-state approach.
- Event data can leverage ClickHouse's native `Map(String, String)` column type
  or a `Nested` structure instead of the flattened rows used in the app DB.
- Connection config lives in Metabase's application settings (not a warehouse
  connection — this is infrastructure config).

**Deliverables:**

- `storage/clickhouse.clj` — protocol implementation.
- ClickHouse table DDL (managed outside Liquibase; possibly an init script the
  backend runs on first connection).
- Integration tests against a real ClickHouse instance (Docker in CI).

---

## Phase 8 — Stream storage backend (optional/plugin)

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
  v
Phase 4  (pipeline)
  │
  v
Phase 5  (HTTP endpoint)
  │
  v
Phase 6  (query integration)

Phase 7  (ClickHouse)  ── depends on Phase 2
Phase 8  (Stream)      ── depends on Phase 2
```

### Parallelism opportunities

After Phase 2 completes, the following work streams can proceed in parallel:

| Stream | Phases | Notes |
|---|---|---|
| **Admin API + Ingestion** | Phase 3 → 4 → 5 | Main sequential path. |
| **Alternative backends** | Phase 7, 8 | Independent of Phases 3–6; can start any time after Phase 2. |

Phases 7 and 8 are independent of each other and of Phases 3–6.

---

## Decisions

| Topic | Decision |
|---|---|
| **Feature flag** | `:product-analytics` |
| **Geolocation** | Check CDN headers first (Cloudflare, Vercel, CloudFront). Fall back to a user-supplied MaxMind GeoLite2 DB file whose path is configured in application settings. No bundled DB. |
| **Rate limiting** | Deferred. Ship Phase 5 without rate limiting; add it as a fast follow once real traffic patterns are understood. |
| **Session salt rotation** | Monthly, same as Umami. Salt rotates on the 1st of each calendar month. |
| **Retention / TTL** | No automatic purge for now. Operators manage DB size themselves. Revisit when usage patterns are clearer. |
| **Table isolation** | Follow the audit DB pattern: tables live in the main schema with a `product_analytics_` prefix, exposed via `v_pa_*` SQL views through a virtual Database record. Permissions are gated by a dedicated collection, not direct DB grants. |
| **Tracker script** | None. The `/send` endpoint is API-compatible with Umami, so operators use Umami's tracker script from a CDN (or self-hosted) pointed at Metabase's endpoint. |
| **Query integration** | Phase 6, after the ingestion pipeline is complete and before alternative storage backends. |
