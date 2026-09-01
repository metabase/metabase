(ns metabase.mcp.paths
  "The URL paths the MCP server is served under, relative to site-url.

   Source of truth for the route aliases — keep in sync with the route map in
   [[metabase.api-routes.routes]] and the resource-metadata endpoints in
   [[metabase.oauth-server.api.metadata]]. A leaf namespace so both the handler and the OAuth
   server can read it without a dependency cycle.")

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
