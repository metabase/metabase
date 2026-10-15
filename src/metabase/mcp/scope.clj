(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   Only a named scope string grants anything, and only by exact match.")

(defn matches?
  "Does `token-scopes` hold the scope `required-scope`?"
  [token-scopes required-scope]
  (boolean (and (string? required-scope)
                (contains? token-scopes required-scope))))
