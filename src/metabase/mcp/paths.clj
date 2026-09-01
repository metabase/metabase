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
   `/api/mcp` predates the canonical name, and `/api/metabase-mcp/v2` is where the current tool
   surface shipped while it was behind a flag. All of them now serve the same surface, so a client
   pointed at any one of them keeps working."
  #{canonical-path
    "/api/mcp"
    "/api/metabase-mcp/v2"})
