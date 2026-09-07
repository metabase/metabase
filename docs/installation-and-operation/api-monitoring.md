---
title: API endpoint monitoring
summary: Which API endpoints hit the application database, which ones query your connected data warehouses, and the response times to expect from each.
---

# Monitor the right API endpoints

Not every Metabase API endpoint is alike. Some endpoints only ever read and write the **application database**, the database where Metabase stores its own data (dashboards, users, settings, metadata). Others send queries to your **connected data warehouses**, the databases you've added so people can analyze their data.

That difference matters when you're setting up monitoring. An endpoint like `GET /api/user/current` should answer in well under a second on any healthy deployment. An endpoint that runs a query against a 2-billion-row warehouse table legitimately takes longer, and a fixed alert threshold would just page you for nothing. This page splits the API into the two groups, plus a third group that calls third-party services, and tells you which response times to expect from each.

## How to use this page

1. Point your uptime checks and synthetic monitors at the endpoints in [Health and smoke-test endpoints](#health-and-smoke-test-endpoints).
2. Set **fixed** response-time alerts on the application-database endpoints. These have stable, predictable latency.
3. Set **relative** (baseline-based) alerts on the warehouse endpoints. Their latency depends on your databases, not on Metabase.
4. Skip alerting on latency for third-party endpoints. Alert on their error rate instead.

The endpoint lists below describe how endpoints behave as of this release. The API surface changes over time, so re-check after a major upgrade. You can list every endpoint your instance serves at `GET /api/docs` (Swagger UI), or download the full machine-readable spec at `GET /api/docs/openapi.json`.

## The two data paths

When a request arrives, one of two things happens:

- **Application database path.** Metabase looks up or writes rows in its own database: sessions, users, collections, cards, dashboards, saved query metadata, permissions, and so on. These are a handful of small, indexed queries. Response time is dominated by Metabase itself, so it's stable and predictable.
- **Warehouse path.** Metabase compiles a question into SQL (or another query language), runs it against a connected database, and streams the results back. Response time is dominated by that database: its load, its indexes, and how much data your question touches. Metabase adds only tens of milliseconds of its own overhead.

A small number of endpoints also call third-party services over the network: identity providers, Slack, SMTP, AI providers, GeoJSON URLs, and so on.

## Endpoints that only use the application database

Unless an endpoint is listed in the warehouse or third-party sections below, it uses only the application database. The main groups:

| Prefix                                                                                                                                                                             | What it covers                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/user`, `/api/session`, `/api/setting`, `/api/setup`                                                                                                                          | Accounts, login, settings, initial setup                                                                                                          |
| `/api/card`, `/api/cards`, `/api/dashboard`, `/api/document`, `/api/collection`                                                                                                    | Saved questions, dashboards, documents, and their CRUD endpoints, including `GET .../query_metadata`                                              |
| `/api/database` (CRUD and metadata)                                                                                                                                                | List databases, get database and table metadata, schemas, fields, autocomplete suggestions (read from synced metadata), sample database           |
| `/api/table` (metadata) and `/api/field` (metadata)                                                                                                                                | Data model browsing, field settings, stored field values (`GET /api/field/:id/values`)                                                            |
| `/api/metric`, `/api/measure`, `/api/segment`                                                                                                                                      | Semantic metadata CRUD                                                                                                                            |
| `/api/search`                                                                                                                                                                      | Full-text search across content                                                                                                                   |
| `/api/permissions`, `/api/api-key`, `/api/api-keys`                                                                                                                                | Permissions graph and API keys                                                                                                                    |
| `/api/activity`, `/api/bookmark`, `/api/timeline`, `/api/timeline-event`, `/api/glossary`, `/api/comment`, `/api/native-query-snippet`, `/api/user-key-value`, `/api/recent_views` | Activity and collaboration features                                                                                                               |
| `/api/revision`, `/api/cache`, `/api/persist`, `/api/index`, `/api/model-index`, `/api/cloud-migration`, `/api/task`, `/api/logger`, `/api/login-history`, `/api/util`             | Housekeeping and diagnostics                                                                                                                      |
| `/api/automagic-dashboards` (X-rays)                                                                                                                                               | Returns generated dashboard _definitions_ built from metadata. The queries inside only run later, through the query endpoints in the next section |
| `/api/ee/**` (Enterprise)                                                                                                                                                          | Most enterprise management endpoints: audit configuration, sandboxing rules, tenants, serialization, and so on                                    |

A few endpoints in these groups do extra work worth knowing about:

- `POST /api/session` (login) hashes the password with bcrypt. That costs 100-300 milliseconds on purpose, so hold login to a slightly higher threshold than other app-database endpoints.
- `GET /api/database/:id/autocomplete_suggestions` reads synced table and field names from the application database. Older Metabase versions queried the warehouse for this; current versions don't.
- `POST /api/collection/graph` and other bulk updates write more rows than a typical read, but stay in the application database.

## Endpoints that query connected data warehouses

Every endpoint below runs queries against the databases you've connected. Most of them share a shape, so you can recognize them by pattern:

- **Ad-hoc query execution:** `POST /api/dataset`. Downloads are `POST /api/dataset/:export-format`, where `:export-format` is `api`, `csv`, `json`, or `xlsx`. Pivots are `POST /api/dataset/pivot`.
- **Saved card queries:** `POST /api/card/:id/query` and `POST /api/card/:id/query/:export-format`, plus `POST /api/card/pivot/:card-id/query`.
- **Dashboard card queries:** `POST /api/dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query`, its `/:export-format` variant, and the matching `POST /api/dashboard/pivot/.../query`.
- **Filter dropdown values:** any `.../params/:param-key/values`, `.../params/:param-key/search/:query`, or `.../params/:param-key/remapping` endpoint on cards, dashboards, public links, and embeds. These run field-value queries against the warehouse. Exception: parameters backed by a static list of values, or served from cached, internally-remapped field values, answer from the application database.
- **Dashboard PDF export:** `POST /api/dashboard/:id/pdf` runs every card on the dashboard synchronously, then streams a PDF. Expect it to take as long as the slowest cards combined.
- **Map tiles:** `GET /api/tiles/...` runs a filtered query per tile.
- **Table browser:** `GET /api/table/:table-id/data`.
- **Writeback actions:** `POST /api/action/:action-id/execute` (and `/execute/values`), the dashboard dashcard `.../execute` endpoints, and the Enterprise `POST /api/ee/action-v2/execute` variants. These write to the warehouse.
- **Field value search and remapping:** `GET /api/field/:id/search/:search-id` and `GET /api/field/:id/remapping/:remapped-id`.
- **Connection tests:** `POST /api/database/validate`, `POST /api/database` (creation validates the connection), `PUT /api/database/:id` (re-validates when connection details change), and `GET /api/database/:id/healthcheck`. These connect to the warehouse and should be quick, but they're only as fast as the database's connection handshake.
- **Schema sync and scans:** `POST /api/database/:id/sync_schema` runs a connection check synchronously, then syncs in the background. `POST /api/database/:id/rescan_values`, `POST /api/table/:id/rescan_values`, and `POST /api/field/:id/rescan_values` return immediately and scan the warehouse in the background. `GET /api/database/:id/syncable_schemas` asks the warehouse for its schema list.
- **Inbound ETL notifications:** `POST /api/notify/db/:id`, `POST /api/notify/db/:id/new-table`, and `POST /api/notify/db/attached_datawarehouse`. Pass `?synchronous=true` and the endpoint blocks until the sync finishes, which can take minutes. Don't alert on its latency.
- **CSV uploads:** `POST /api/upload/csv` creates a table in the uploads-enabled database (the connected database admins pick for uploads) and inserts the file's rows there, then syncs and scans the new table. It holds the request until the data is written, so its latency is the warehouse's insert speed, not Metabase's.

The same query endpoints also exist for shared and embedded content:

- **Public links:** `GET /api/public/card/:uuid/query[/:export-format]`, `GET /api/public/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id[/:export-format]`, the matching pivot, `tiles`, `params`, and `action/:uuid/execute` endpoints.
- **Signed embeds:** the `/api/embed/card/:token/...`, `/api/embed/dashboard/:token/...` equivalents, including tiles, params, pivots, and the `/api/preview_embed/**` versions admins use while building embeds.
- **AI agents and MCP clients:** `/api/agent/v1/execute`, `/api/agent/v1/execute-sql`, `/api/agent/v2/query`, `/api/agent/v1/read-resource`, `/api/agent/v1/question/:id/query`, and the `/api/metabase-mcp` (alias `/api/mcp`) tool endpoints all run queries against warehouses.
- **Enterprise analytics features:** `POST /api/metric/dataset`, `POST /api/metric/breakout-values`, metric and measure dimension `values`/`search`/`remapping` endpoints, the transform endpoints (`POST /api/ee/transforms/:id/run` and `/run-dag` trigger warehouse work in the background), the transform inspector (`POST .../inspect/:lens-id/query`), and the data studio table endpoints (`/sync-schema`, `/rescan-values`, `/discard-values`, `/edit`).
- **Notification delivery:** `POST /api/notification/:id/send` and `POST /api/notification/send` run the alert's card queries inline, then deliver results by email or Slack. Their latency is warehouse-plus-channel.
- **Explorations:** `GET /api/exploration/query/:id` streams results that a background runner already fetched from the warehouse, so the response itself comes from Metabase storage. The warehouse work shows up in your background-task metrics, not in this endpoint's latency.

One caveat: card and dashboard query endpoints may answer from Metabase's [cache](../configuring-metabase/caching.md) and come back in milliseconds. A fast response doesn't mean the warehouse was healthy. That's why warehouse monitoring needs a synthetic query that bypasses the cache (see the smoke-test section below).

## Health and smoke-test endpoints

Use these for uptime checks and post-deploy smoke tests. None of them touch a data warehouse, so a failure here always means a Metabase problem, not a database problem.

| Endpoint          | What it checks                                                                                                                              | Auth needed |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `GET /api/health` | Metabase is up and can reach the application database. Returns `{"status":"ok"}`, or `{"status":"initializing"}` with 503 while starting up | No          |
| `GET /readyz`     | Same check as `/api/health`, intended as a readiness probe                                                                                  | No          |
| `GET /livez`      | The process is alive. No database access at all, always answers 200 when running                                                            | No          |

## Response times to expect

The numbers below are sensible targets for a healthy, modestly loaded deployment. Treat them as starting points and tighten or loosen them against your own history.

Application-database endpoints (fixed thresholds):

| Request                                                                                                            | Healthy                    | Investigate when           | Notes                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `GET /livez`                                                                                                       | < 100 ms                   | Any non-200                | No database access                                                              |
| `GET /api/health`, `GET /readyz`                                                                                   | < 500 ms                   | > 1-2 s, or 503            | 503 means the application database is unreachable or Metabase is still starting |
| `GET /api/user/current`                                                                                            | p50 < 150 ms, p95 < 500 ms | p95 above 500 ms sustained | Session + user + permissions on every page load                                 |
| `GET /api/session/properties`                                                                                      | p95 < 500 ms               | > 1 s                      |                                                           |
| `POST /api/session` (login)                                                                                        | p95 < 1 s                  | > 2 s                      | Includes deliberate bcrypt hashing (100-300 ms)                                 |
| CRUD reads (`/api/database`, `/api/card/:id`, `/api/dashboard/:id`, `/api/collection/**`)                          | p95 < 500 ms               | > 1 s                      | Small indexed queries                                                           |
| Metadata hydration (`/api/table/:id/query_metadata`, `/api/database/:id/metadata`, `/api/card/:id/query_metadata`) | p95 < 1 s                  | > 2 s                      | Joins several metadata tables                                                   |
| `GET /api/search?q=x`, `GET /api/collection/tree`                                                                  | p95 < 1 s                  | > 2 s                      | Heavier application-database work                                               |

Warehouse endpoints (relative thresholds, because your databases set the pace):

| Request                                                                                                        | Healthy                                                                                      | Investigate when                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Synthetic warehouse probe: `POST /api/dataset` with a trivial native query (`select 1`) per connected database | Completes within the database's normal connection plus execution time (often well under 1 s) | p95 above a few seconds, or a rising error rate                                          |
| `POST /api/card/:id/query`, dashboard dashcard queries                                                         | Tracks each card's own history. Metabase records an average execution time per card          | p95 exceeds 3× its trailing 7-day baseline                                               |
| Filter dropdown (`params/.../values`) endpoints                                                                | Usually sub-second                                                                           | p95 above a few seconds; these run unbounded field-value lookups                         |
| `POST /api/dashboard/:id/pdf`                                                                                  | Sum of the dashboard's card runtimes                                                         | Any single card regressing, or combined time approaching your proxy timeout              |
| `POST /api/database/validate`, `GET /api/database/:id/healthcheck`                                             | One connection handshake                                                                     | > 5-10 s; usually network or credential trouble, not load                                |
| `POST /api/upload/csv`                                                                                         | Scales with file size and warehouse insert speed                                             | Steadily growing over time; it writes and then syncs inline                              |

A good backstop for the whole warehouse group: page if any query endpoint's p95 crosses, say, 60 seconds, and warn when it crosses 3× baseline. Big exports (`POST .../query/csv` on large results) legitimately run for minutes, so scope absolute limits to dashboard-serving traffic.

## How to collect the numbers

- **Application logs.** Every API request is logged with its elapsed time and application-database query count, in the form `GET /api/user/current 200 27ms (3 DB calls)`. The `DB calls` count is your tell: warehouse endpoints log few calls because the real work happens elsewhere. See [Application logs](./application-logs.md).
- **Prometheus.** Set `MB_PROMETHEUS_SERVER_PORT` and scrape the instance. The useful series are `jetty_request_time_seconds_total` (per-URI request time, so you can compute p95 per endpoint group), `jetty_dispatched_active` (concurrent requests, i.e., queueing), and `metabase-query-processor/query` (query success/failure counts by driver). See [Observability with Prometheus](../installation-and-operation/observability-with-prometheus.md).
- **Per-question history.** Metabase stores each query execution with its runtime and keeps a running average per saved question. That history is what makes baseline alerting on card queries practical, and it's visible in usage analytics and the audit tools.
- **Uptime checks.** `GET /api/health` needs no authentication, so an external uptime monitor can call it directly.

## Suggested alert rules

1. **Liveness:** `GET /livez` non-200 for 1 minute. Restart the process.
2. **Readiness:** `GET /api/health` non-200 or 503 for 2 minutes. The application database is unreachable; check the database and connection pool.
3. **Application database health:** p95 of `GET /api/user/current` above 500 ms for 5 minutes. Metabase or its application database is struggling.
4. **Warehouse health:** for each connected database, a scheduled synthetic `POST /api/dataset` "SELECT 1" query failing, or exceeding 3× its baseline for 10 minutes.
5. **Serving health:** p95 of dashboard card query endpoints above 3× their 7-day baseline for 10 minutes. People's dashboards are slow right now; check the warehouse's load.
6. **Saturation:** `jetty_dispatched_active` above your thread pool size, or a rising queue of pending queries. Requests are waiting, not executing.
