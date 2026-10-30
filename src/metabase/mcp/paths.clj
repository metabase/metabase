(ns metabase.mcp.paths
  "The URL paths the MCP server is served under, relative to site-url.

   Source of truth for the route aliases — keep in sync with the route map in
   [[metabase.api-routes.routes]] and the resource-metadata endpoints in
   [[metabase.oauth-server.api.metadata]].")

(set! *warn-on-reflection* true)

(def canonical-path
  "The advertised MCP URL. RFC 9728 metadata names `<site-url><this>` as the resource identifier,
   and that is the string an RFC 8707 `resource` indicator is matched against."
  "/api/metabase-mcp")

(def endpoint-paths
  "Every path that serves MCP: the canonical one, plus `/api/mcp`, which predates it and is kept for
   back-compat with existing client configs. Both serve the same surface.

   The following are derived from this set and must not drift from it:
   1. the route table mounts exactly these paths
   2. `metabase.oauth-server.api.metadata` publishes one RFC 9728 document per path
   3. `metabase.oauth-server.api.oauth/narrow-scope-to-resource` recognises an RFC 8707 `resource` indicator
   only if it names one.
   4. the session middleware uses these to determine bearer-only paths

  A path that still serves traffic but is missing from this set fails CLOSED, so the grant loses every MCP scope."
  #{canonical-path
    "/api/mcp"})
