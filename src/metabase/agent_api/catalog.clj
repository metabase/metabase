(ns metabase.agent-api.catalog
  "Which Agent API namespaces publish MCP tools.

   A leaf namespace, with no requires, on purpose: the MCP layer reads this to generate the tool manifest and
   to advertise the OAuth scopes the tools declare, and it has to do that without requiring the endpoint
   namespaces themselves — the route table those live in reaches back around to the MCP server through the
   HTTP middleware stack, and requiring them from [[metabase.mcp.core]] closes that loop.")

(set! *warn-on-reflection* true)

(def tool-namespaces
  "The namespaces whose `defendpoint`s carry `:tool` metadata, each mapped to the URL prefix its endpoints are
   served under. The manifest and the scope advertisement are generated from exactly these, so a tool
   namespace absent here publishes no tool.

   The namespaces are named rather than required: they are loaded by the route table by the time anything
   reads their endpoint metadata."
  {'metabase.agent-api.api    "/api/agent"
   'metabase.agent-api.v1-api "/api/agent"})
