(ns metabase.mcp.paths
  "The URL paths the MCP server is served under, relative to site-url.

   Source of truth for the route aliases — keep in sync with the route map in
   [[metabase.api-routes.routes]] and the resource-metadata endpoints in
   [[metabase.oauth-server.api.metadata]] — and for the scope sets the v2 surface accepts and advertises.

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
  "Every path that serves MCP: the canonical one, plus `/api/mcp`, which predates it and is kept for
   back-compat with existing client configs. Both serve the same surface.

   Three things are derived from this set and must not drift from it: the route table mounts exactly
   these paths, `metabase.oauth-server.api.metadata` publishes one RFC 9728 document per path, and
   `metabase.oauth-server.core/narrow-scope-to-resources` recognises an RFC 8707 `resource` indicator
   only if it names one. A path that still serves traffic but has dropped out of this set fails
   OPEN — the indicator matches nothing, so the grant is never narrowed to the MCP surface.

   `/api/metabase-mcp/v2` was here while v2 shipped behind a flag. It was retired at the switchover,
   along with its route entry and its metadata document."
  #{canonical-path
    "/api/mcp"})

(def v2-surface-scopes
  "Every OAuth scope the v2 MCP surface accepts, as an ordered vector — unlike [[endpoint-paths]] above, which
   is a set. The order is the order an `insufficient_scope` challenge lists them in, and `contains?` on this
   would test an index rather than a scope.

   Three things must agree on these, and they are reached from different places, which is why they live in
   this leaf rather than beside any one of them:

   - what the MCP resource accepts when RFC 8707 narrowing trims a requested scope
     ([[metabase.oauth-server.core/narrow-scope-to-resource]]);
   - what the OAuth server will actually grant — a dynamic client's ceiling always includes
     [[metabase.mcp.core/all-scopes]], and `validate-scope` checks requests against that ceiling;
   - what v2 tools and resources may gate on.

   When the challenge drifted ahead of the grant, a client that followed it asked for exactly what it was told
   and was answered \"Invalid scope\", so the connect failed outright instead of degrading to a narrower grant
   (GHY-4226).

   Spelled as literals rather than read from `metabot.scope` because requiring that namespace here would close
   the load cycle described above; `v2-surface-scopes-match-metabot-scope-test` is what keeps them in step.
   Scopes are never renamed — issued tokens carry literal strings — so this only ever grows."
  ["agent:content:read"
   "agent:content:write"
   "agent:query:run"
   "agent:sql:run"
   "agent:delivery:write"
   "agent:resource:read"])

(def v2-baseline-scopes
  "The least-privilege subset of [[v2-surface-scopes]], in its order: what an MCP client is told to request when it
   first connects, through the 401 challenge and the protected-resource metadata. A client reaches the rest of the
   surface by stepping up on a 403 `insufficient_scope`."
  ["agent:content:read"
   "agent:resource:read"])
