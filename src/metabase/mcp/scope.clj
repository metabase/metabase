(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources."
  (:require
   [metabase.api.macros.scope :as api.scope]))

(defn matches?
  "Does `token-scopes` grant access to an entity with the given `required-scope`?
   - nil `token-scopes` always matches (internal callers).
   - `::api.scope/unrestricted` in `token-scopes` always matches (session auth or unscoped JWT)
   - nil `required-scope` only matches the two cases above.
   - otherwise use hierarchical matching"
  [token-scopes required-scope]
  (boolean
   (or (nil? token-scopes)
       (contains? token-scopes ::api.scope/unrestricted)
       (and (some? required-scope)
            (api.scope/scope-satisfied? token-scopes required-scope)))))
