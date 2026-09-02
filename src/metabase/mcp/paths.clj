(ns metabase.mcp.paths
  "The URL paths the MCP server is served under, relative to site-url.

   Source of truth for the route aliases — keep in sync with the route map in
   [[metabase.api-routes.routes]] and the resource-metadata endpoints in
   [[metabase.oauth-server.api.metadata]] — and for the scope set the v2 surface accepts.

   A leaf namespace, with NO requires, so both the handler and the OAuth server can read it without a
   dependency cycle. That is load-bearing rather than tidy: `metabase.server.middleware.security` requires
   `metabase.mcp.core`, so anything `mcp.core` reaches becomes part of the security middleware's load path —
   pulling `metabot.scope` (and through it `premium-features`) in that way deadlocks namespace loading with a
   methodical protocol error at web-server start. Keep this namespace dependency-free.")

(set! *warn-on-reflection* true)

(def canonical-path
  "The advertised MCP URL. RFC 9728 metadata names `<site-url><this>` as the resource identifier,
   and that is the string an RFC 8707 `resource` indicator is matched against."
  "/api/metabase-mcp")

(def endpoint-paths
  "Every path that serves MCP, including aliases kept for back-compat with existing client configs:
   `/api/mcp` predates the canonical name, and `/api/metabase-mcp/v2` is where the v2 tool surface
   lives during the migration.

   They do NOT all serve the same surface yet: until the switchover, `/api/metabase-mcp/v2` reaches
   v2 and the other two reach v1. This set is what the 401 challenge matches a request URI against,
   so a client is pointed back at the alias it connected through rather than at the canonical path;
   that holds either way. Route dispatch matches one segment at a time, so paths BELOW an entry
   (e.g. `/api/metabase-mcp/v2/anything`) also reach the handler and fall back to `canonical-path`
   in the challenge."
  #{canonical-path
    "/api/mcp"
    "/api/metabase-mcp/v2"})

(def v2-surface-scopes
  "Every OAuth scope the v2 MCP surface accepts.

   Three things must agree on this set, and they are reached from different places, which is why it lives in
   this leaf rather than beside any one of them:

   - the 401 `WWW-Authenticate` challenge, which tells an uninstructed client what to ask for
     ([[metabase.mcp.v2.api/default-ask-scopes]]);
   - what the OAuth server will actually grant — DCR's default registration and `validate-scope` both read
     [[metabase.mcp.core/all-scopes]];
   - what v2 tools and resources may gate on.

   When the challenge drifted ahead of the grant, a client that followed it asked for exactly what it was told
   and was answered \"Invalid scope\", so the connect failed outright instead of degrading to a narrower grant
   (GHY-4226).

   Spelled as literals rather than read from `metabot.scope` because requiring that namespace here would close
   the load cycle described above; `v2-surface-scopes-match-metabot-scope-test` is what keeps them in step.
   Scopes are never renamed — issued tokens carry literal strings — so this set only ever grows."
  ["agent:content:read"
   "agent:content:write"
   "agent:query:run"
   "agent:sql:run"
   "agent:delivery:write"
   "agent:resource:read"])
