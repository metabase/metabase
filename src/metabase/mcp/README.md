# Metabase MCP Server

Metabase includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI
clients connect directly to a Metabase instance. It speaks the 2026-07-28 stateless core over the [Streamable HTTP
transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) and builds on
Metabase's [Agent API](../agent_api/) to expose tools for searching, navigating, querying, visualizing, and
creating/updating content - all scoped to the connecting user's permissions.

## Endpoint

The MCP server is available at:

```
https://{your-metabase.example.com}/api/metabase-mcp
```

The legacy `/api/mcp` path still works as an alias for existing clients, but `/api/metabase-mcp` is the
canonical URL to advertise.

## Connecting a client

Point any MCP-compatible client at the `/api/metabase-mcp` endpoint. For example, with Claude Code:

```sh
claude mcp add metabase https://{your-metabase.example.com}/api/metabase-mcp --transport streamable-http
```

For Claude Desktop, create a [custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
using the same URL.

For Cursor, open **Settings > MCP** and add a new server with the type set to `streamable-http` and the URL:

```
https://{your-metabase.example.com}/api/metabase-mcp
```

## Authentication

MCP clients authenticate via **OAuth 2.0**. Metabase runs its own embedded OAuth server - no external provider is
needed.

The flow for a first-time connection:

1. The client discovers Metabase's OAuth endpoints.
2. The client registers itself with Metabase.
3. The user is redirected to Metabase to log in and approve the connection.
4. The client receives an access token scoped to the user's Metabase permissions.

Browser-based sessions (cookie auth) are also supported and receive unrestricted scopes.

### Scopes

Access tokens are scoped to limit what tools a client can use:

| Scope                     | Grants access to                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `agent:search`            | `search`                                                                                                       |
| `agent:resource:read`     | `read_resource` (always granted to any authenticated caller; per-URI perm checks happen inside the dispatcher) |
| `agent:query:construct`   | `construct_query`                                                                                              |
| `agent:query`             | `query`                                                                                                        |
| `agent:query:execute`     | `execute_query`                                                                                                |
| `agent:sql:construct`     | `construct_native_query`                                                                                       |
| `agent:sql:execute`       | `execute_sql`                                                                                                  |
| `agent:question:create`   | `create_question`                                                                                              |
| `agent:question:update`   | `update_question` (also covers "move card to collection")                                                      |
| `agent:question:execute`  | `execute_question`                                                                                             |
| `agent:metric:create`     | `create_metric`                                                                                                |
| `agent:metric:update`     | `update_metric` (also covers "move metric to collection" and archiving)                                        |
| `agent:dashboard:create`  | `create_dashboard`                                                                                             |
| `agent:dashboard:update`  | `update_dashboard`                                                                                             |
| `agent:collection:create` | `create_collection`                                                                                            |

Wildcard patterns (e.g. `agent:*`) match any scope with that prefix.

OAuth protected resource metadata is available at:

```
/.well-known/oauth-protected-resource/api/metabase-mcp
```

By default our consent screen grants access to all scopes without the opportunity to customize.

## Available tools

The MCP server exposes these tools, dynamically generated from the Agent API endpoint metadata:

### Discovery + read

| Tool            | Description                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`        | Search for tables, metrics, cards, dashboards, and collections using keyword or natural-language queries.                                                           |
| `read_resource` | Read one or more Metabase entities by `metabase://` URI. Covers database/schema/table/collection/question/dashboard/metric/transform navigation. Up to 5 URIs per call. |

### Query construction + execution

| Tool              | Description                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `construct_query` | Construct a query against a table or metric. Accepts the user's original `prompt` when available. Returns an opaque `query_handle` for use with `execute_query` or `visualize_query`.          |
| `construct_native_query` | Construct a native (raw SQL) query for a database. Returns an opaque `query_handle` to feed `create_question` and save it. Does not execute the SQL; native handles are rejected by `execute_query`/`query` (use `execute_sql` to run raw SQL). |
| `query`           | Query a table or metric directly. Supports pagination via continuation tokens.                                                                                                                 |
| `execute_query`   | Execute a previously constructed query and return results with column metadata.                                                                                                                |
| `execute_sql`     | Execute a raw SQL query against a database. Requires the user to have native-query permission on the target database. Can be disabled instance-wide via the `mcp-execute-sql-enabled` setting. |
| `execute_question` | Run a saved question by id and return its rows + column metadata. Runs under the caller's permissions. Parameterized questions are not supported (returns an error). |

### Write

| Tool                | Description                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `create_metric`     | Save a query as a reusable metric. Accepts a `query_handle` from `construct_query`. The query needs one aggregation and at most one date grouping. |
| `update_metric`     | Update a saved metric. Patch semantics. Setting `collection_id` moves it; setting `archived: true` archives it — a reversible soft delete, used when asked to delete a metric. A replacement `query` must still be a valid metric. |
| `create_question`   | Save a query as a named question (card). Accepts a `query_handle` from `construct_query` (MBQL) or `construct_native_query` (native SQL). Saving native requires native-query DB permission. |
| `update_question`   | Update a saved question. Patch semantics. Setting `collection_id` moves the card. Setting `archived` archives it. Replacing the query accepts a `construct_query` or `construct_native_query` handle. |
| `create_dashboard`  | Create a new dashboard, optionally populated with saved questions (auto-positioned on the grid).                  |
| `update_dashboard`  | Update a dashboard's metadata (name, description, collection, archived).                                          |
| `create_collection` | Create a new collection. Optionally nested under a `parent_collection_id`.                                        |

Query results are limited to 200 rows per request. When more rows are available, the response includes a
`continuation_token` that can be passed back to fetch the next page.

`read_resource` list responses cap at 25 items with `truncated` / `total` signals; drill into specific URIs to see
more, or refine via `search`.

## Resources

The server exposes MCP [resources](https://modelcontextprotocol.io/specification/2025-03-26/server/resources) so
clients can fetch supplementary content by URI without inflating tool descriptions.

| Resource URI                         | Description                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `skill://metabase/{name}`            | A skill (see below). Reference material sits beside it at `skill://metabase/{name}/references/{file}`.             |
| `metabase://docs/construct-query.md` | Program syntax for `construct_query` and `query`: sources, operations, operator forms, worked examples, pitfalls. |
| `ui://metabase/*`                    | The MCP Apps iframe the `ui` tools render into.                                                                    |

The `read_resource` **tool** (above) uses a separate URI scheme to navigate Metabase entities (`metabase://question/{id}`,
`metabase://database/{id}/tables`, etc.). The two URI namespaces are independent: `metabase://docs/...` is for static
reference content fetched via MCP `resources/read`, while `metabase://table/...` and friends are entity URIs passed
to the `read_resource` tool.

## The guidance layer

Most agent failures are cognitive — premature stopping, bad synthesis — rather than tool-selection ones, so what the
server *says* is as load-bearing as what it exposes. It says it in three tiers, and each tier exists because the one
below it cannot carry that content.

**Tier 1 — server `instructions`** ([`instructions.clj`](instructions.clj), the text in
[`resources/mcp/instructions.md`](../../../resources/mcp/instructions.md)). Returned from `server/discover` and from
`initialize`, so it works in every client that injects instructions at all. The budget is 2KB, and the first ~500
characters have to stand alone, because some clients inject only the opening. It carries what no tool description can:
what the server is for, the canonical workflow (find → inspect → run → save → organize), the read/write split, and
which skill to load before a multi-step job.

**Tier 2 — skills** ([`skills.clj`](skills.clj), the markdown in
[`resources/mcp/skills/`](../../../resources/mcp/skills/)). Seven of them — `core`, `mbql`, `native-sql`, `dashboard`,
`visualization`, `document`, `curation` — in the [Agent Skills](https://agentskills.io) open-standard format, served as
resources at `skill://metabase/<name>`: the URI shape SEP-2640 proposes, so a client that learns to fetch skills gets
these without a server change. Instructions say how to use the tools; a skill says how to run a *process* with them.
Unbounded, and paid for only by the job that loads one.

**Tier 3 — prompts** ([`prompts.clj`](prompts.clj), the templates in
[`resources/mcp/prompts/`](../../../resources/mcp/prompts/)). `explore_database` and `build_dashboard`, surfacing as
slash commands (`/mcp__metabase__build_dashboard`) in clients that support prompts. User-invoked, so they complement
the other two tiers rather than repeating them — and they are what makes the server useful in a client that ships no
skill support at all. Scope-filtered like tools: a token that cannot write is not offered a playbook whose fourth step
is a write.

**No `load_skill` tool, for now.** A skill-loading *tool* would work in every tools-only client, at the cost of one
catalog slot and one more decision for the model to get wrong. Whether that trade is worth making is a question about
clients that will never fetch a `skill://` resource, and the eval harness is what answers it: `mcp-evals` runs the
suite for a `tools-only` client class and the `guidance-lift` gate reports the gap. Ship the tool when that gap says
those clients need it — not before, and never alongside SEP-2640 fetching, because two ways to load a skill is one too
many.

## Protocol

The server targets the **2026-07-28 stateless core**. There is no handshake to complete and no session to carry:
every request stands on its own, and a client may open a connection and call a tool as its first message.

| Method                      | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `server/discover`           | What the server is and what it supports. Replaces connect-time negotiation.  |
| `tools/list`                | List available tools (filtered by the token's scopes).                       |
| `tools/call`                | Call a tool with arguments.                                                  |
| `resources/list`            | List available resources (filtered by the token's scopes).                   |
| `resources/read`            | Read a resource by URI.                                                      |
| `prompts/list`              | List the playbooks (filtered by the token's scopes).                         |
| `prompts/get`               | Render a playbook with the caller's arguments.                               |
| `ping`                      | Keepalive ping.                                                              |
| `initialize`                | Accepted from clients that predate the stateless core (see below).           |
| `notifications/initialized` | Accepted as a no-op.                                                         |

One JSON-RPC message per POST — batching was removed from the spec, and an array body is refused rather than
half-served. The server responds with JSON or SSE depending on the `Accept` header.

**Everything hangs off the authenticated user.** Query handles are keyed `(user, uuid)`, throttling is keyed by
user, and the embedding session key the MCP Apps iframe authenticates with is derived from the user id. A handle
stored by one connection therefore resolves from the next, and there is nothing left for a session id to own.

**Client capabilities travel per-request**, in `params._meta` under `io.modelcontextprotocol/capabilities`. That is
how `tools/list` knows whether the caller can render MCP Apps, and so whether to offer the UI tools.

**Cacheable results.** `tools/list`, `resources/list`, and `resources/read` carry `ttlMs` and `cacheScope` so a
client can hold the payload in its prompt prefix across turns. `cacheScope` is `"global"` when every caller gets
byte-identical content (the reference docs) and `"session"` when the content is settled by the caller's granted
scopes and capabilities (the listings). Content that varies per caller in a way that must never be reused — the MCP
Apps iframe, which embeds a live session key — carries no cache metadata at all. `tools/list` is sorted by name
across both the manifest and the UI registry, because an unstable order costs the client its cache hit on every
reconnect.

**Routing headers.** A client may repeat the method in `Mcp-Method`, and the tool name in `Mcp-Name`, so a gateway
can route a request without parsing its body. They are a hint, never the source of truth: if a header disagrees with
the body the request is refused rather than resolved in either direction, since an intermediary routing one request
while the server runs another is request smuggling.

### Older clients

`initialize` still works. It negotiates a protocol version both sides know and hands back an `Mcp-Session-Id`. That
id is not established state — the server stores nothing behind it and looks nothing up by it. It exists because a
pre-RC client advertises its capabilities exactly once, at the handshake, and never again: the id carries that
client's MCP Apps capability in its own bytes, so a later cold `tools/list` can still honor it. `DELETE` is accepted
from clients that send it on disconnect; it closes out the usage-analytics row and does nothing else.

### Deliberately not built on

Sampling, Roots, and Logging (deprecated); the Tasks API (experimental and being reworked — long queries live within
HTTP timeouts plus handle/offset continuation); JSON-RPC batching and SSE resumability / `Last-Event-ID` (both
removed from the spec).

Tool schemas are published to the **client floor, not the spec ceiling**. The spec allows JSON Schema 2020-12
conditionals, but the Claude API rejects top-level combinators and OpenAI strict mode cannot express discriminated
unions, so the strict-client override layer stays unconditionally on.

On the auth roadmap: Dynamic Client Registration is deprecated in favor of Client ID Metadata Documents, which the
embedded OAuth server should plan for; Enterprise-Managed Authorization is worth tracking for centrally-managed
deployments.

## Architecture

The implementation lives in these files:

- **[`api.clj`](api.clj)** - The HTTP handler. Parses the JSON-RPC request, authenticates it, enforces the origin
  check (DNS rebinding protection), validates the routing headers against the body, and dispatches to the method.
  Supports both JSON and SSE response formats.

- **[`session.clj`](session.clj)** - The per-user state: the query-handle store (content-addressed, TTL'd, keyed
  `(user, uuid)`) and the embedding session key the MCP Apps iframe authenticates with, derived from the user id.
  Also mints the self-describing capability hint older clients get back from `initialize`.

- **[`tools.clj`](tools.clj)** - Tool dispatch and manifest generation. Builds the tool list from Agent API endpoint
  metadata, checks scopes, and routes tool calls through synthetic Agent API requests. `two-channel-content` is the
  v2 result shape: the data is serialized once into the text block and `structuredContent` carries only the machine
  next-step fields.

- **[`../agent_api/tools.clj`](../agent_api/tools.clj)** - The handler-facing conventions harness the v2 tool
  endpoints build on: the `_write` method-enum recipe (`MethodField` + `validate-write!`), `response_format`
  projections, the bounded list envelope with steering truncation, the complete-units-then-named-remainder budgeter,
  teaching errors, and ref ergonomics.

- **[`resources.clj`](resources.clj)** - MCP resource registry and handlers. Holds documentation resources (like
  the `construct_query` reference) keyed by URI, with scope-based access control on `resources/list` and
  `resources/read`.

- **[`instructions.clj`](instructions.clj)**, **[`skills.clj`](skills.clj)**, **[`prompts.clj`](prompts.clj)** - the
  three tiers of the guidance layer (above). `skills.clj` loads and validates the shipped skills and publishes them
  through the resource registry; `prompts.clj` renders the playbooks `prompts/get` returns.

- **[`scope.clj`](scope.clj)** - Scope matching logic. Supports exact matches, wildcard patterns, and the
  `::unrestricted` sentinel for session-based auth.

### Request flow

```
MCP client
  -> POST /api/metabase-mcp (one JSON-RPC message)
  -> Origin check + routing-header agreement
  -> Auth: OAuth bearer token or browser session
  -> Scope check against requested tool
  -> Synthetic request to Agent API endpoint, as the caller's real user
  -> Response materialized as MCP content
  -> JSON or SSE back to client
```

## Permission enforcement

The invariant: **a tool can never do what the caller couldn't do in the app, because tool code never
gets the chance to skip a check.** Three rules hold it up, and a test matrix proves it.

**1. Every tool call runs as the caller's real user, through the standard endpoint stack.** A
`tools/call` becomes a synthetic in-process Ring request to an Agent API `defendpoint` handler under
the caller's `*current-user-id*`, so endpoint checks, model-level `can-read?`/`can-write?`, and the
query processor's permission middleware (sandboxing, impersonation, native-query permission) fire
exactly as they do for a browser request.

This is why tool code must not reach the app DB itself: a `t2/select` gets the row without asking
whether the caller may see it. A kondo rule (`mcp-tool-namespaces` in
[`.clj-kondo/config.edn`](../../../.clj-kondo/config.edn)) bans `toucan2.core` and the app-DB query
helpers from `metabase.mcp.*` and `metabase.agent-api.*`, excluding the MCP server's own Toucan
models under `metabase.mcp.models.*`.

**2. Share the handler, not the pattern.** Where a tool is 1:1 with a public REST endpoint, it calls
the *same domain function the public handler calls*. A parallel reimplementation is where a forgotten
`write-check` slips in — and, because the check lives in the shared function, it cannot diverge:

| Tool | Delegates to |
| --- | --- |
| `collection_write` | `collections_rest/api.clj` — `POST /`, `PUT /:id` |
| `snippet_write` | `native_query_snippets/api.clj` — `POST /`, `PUT /:id` |
| `segment_write` | `segments/api.clj` — `POST /`, `PUT /:id` |
| `measure_write` | `measures/api.clj` — `POST /`, `PUT /:id` |
| `duplicate_content` | `queries_rest/api/card.clj` `POST /:id/copy`, `dashboards_rest/api.clj` `POST /:from-dashboard-id/copy`, `documents/api/document.clj` `POST /:from-document-id/copy` |
| `bookmark_content` | `bookmarks/api.clj` — `POST /:model/:id`, `DELETE /:model/:id` |
| `revert_content` | `revisions/api.clj` — `POST /revert` |
| `add_timeline_event` | `timeline/api/timeline_event.clj` — `POST /` |
| `alert_write`, `subscription_write` | `notification/api/notification.clj` — `POST /` |

Workflow tools (`dashboard_write`'s ops, `browse_data`) compose several such calls in-process, each
carrying its own check. [[metabase.agent-api.tools/run-ops!]] applies them in order and aborts the
whole call on the first failure, naming the op's index.

**3. Same path, same side effects.** View logs, recent items, and usage analytics only stay correct
if a tool read leaves the trail a browser read leaves. [[metabase.agent-api.tools/publish-read-event!]]
publishes the `:event/*-read` event that the entity's REST read endpoint publishes, with the same
payload. Cards have no entry: a card's REST read publishes nothing, and `:event/card-read` comes from
the query processor when the card is *run*.

**The permission-parity matrix** (`metabase.mcp.permission-parity-test`, plus the sandboxing rows in
`metabase-enterprise.mcp.permission-parity-test`) is the backstop. Each row calls a tool and the
public REST endpoint it stands in for, as the same user under one permission scenario — blocked
database, no collection access, no native-query permission, read-only collection, archived target,
sandboxed user — and asserts the two give the same answer. Adding a tool means adding its rows with
`check-parity!`. The release gate is zero discrepancies.

### Reviewing a tool

- Does it delegate to the domain function the public handler calls, or reimplement it?
- Does it touch Toucan or the app DB? (The linter says no. Silencing the linter is not the fix.)
- Does a read publish the read event its REST endpoint publishes?
- Does a workflow tool abort the whole call on a failed op, rather than half-applying?
- Are there parity rows for its denial scenarios?

## Evals

Tool descriptions are the API, and a copyedit to one is a behavior change. Unit tests cannot see that;
[`mcp-evals/`](../../../mcp-evals/) can. It runs 30+ realistic BI tasks against a seeded instance
through the Claude Agent SDK and reports pass@k, the wrong-tool confusion matrix, argument
hallucination, tokens, call counts against a reference trajectory, and p95 response size. Every
release gate in the plan carries a number, and `mcp-evals/src/gates.ts` is where those numbers live —
including the three owned by tests elsewhere (`read_resource` coverage, the dashboard op map, the
permission-parity matrix), which are reported in rather than re-derived, so one report answers whether
the server can ship.

The suite is what *decides* the design's contested calls rather than arguing them: each merged
`<entity>_write` tool is probed on create, on update, and on a deliberate wrong method, and a method
whose pass rate lags the catalog median by more than ten points fires the pre-registered trigger to
split that entity back into `create_X`/`update_X`. Re-run it on every description change.

**Projections live in one place.** `metabase.agent-api.projections` holds the concise field set for
every entity a read tool returns. A tool never invents its own — it looks the entity up and hands the
spec to `project`, so the same entity reads the same way through every tool that returns it, and the
reason a field set is what it is sits next to the field set.

## Further reading

- [MCP user docs](../../../docs/ai/mcp.md)
- [Agent API source](../agent_api/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
