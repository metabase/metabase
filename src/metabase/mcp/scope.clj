(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   Wraps [[metabase.api-scope.core/scope-matches?]] with the conventions used by
   MCP entry points: nil token-scopes (internal callers) and the `::scope/unrestricted`
   sentinel (session auth or unscoped JWT) both bypass the check."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.api.macros.scope :as scope]))

(defn matches?
  "Does `token-scopes` grant access to an entity with the given `required-scope`?
   - nil `token-scopes` always matches (internal callers).
   - `::scope/unrestricted` in `token-scopes` always matches.
   - nil `required-scope` only matches the two cases above (callers that want
     \"public to any authenticated MCP user\" should bypass this check).
   - Otherwise delegates wildcard/exact matching to [[api-scope/scope-matches?]]."
  [token-scopes required-scope]
  (or (nil? token-scopes)
      (contains? token-scopes ::scope/unrestricted)
      (boolean (and (some? required-scope)
                    (api-scope/scope-matches? token-scopes required-scope)))))
