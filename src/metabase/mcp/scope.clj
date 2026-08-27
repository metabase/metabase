(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   Wraps [[metabase.api.macros.scope/scope-satisfied?]] with the conventions used by
   MCP entry points: nil token-scopes (internal callers) and the `::scope/unrestricted`
   sentinel (session auth or unscoped JWT) both bypass the check."
  (:require
   [metabase.api.macros.scope :as api.scope]))

(defn matches?
  "Does `token-scopes` grant access to an entity with the given `required-scope`?
   - nil `token-scopes` always matches (internal callers).
   - `::api.scope/unrestricted` in `token-scopes` always matches.
   - nil `required-scope` only matches the two cases above (callers that want
     \"public to any authenticated MCP user\" should use [[public-or-matches?]]).
   - Otherwise delegates wildcard/exact matching to [[api.scope/scope-satisfied?]]."
  [token-scopes required-scope]
  (or (nil? token-scopes)
      (contains? token-scopes ::api.scope/unrestricted)
      (boolean (and (some? required-scope)
                    (api.scope/scope-satisfied? token-scopes required-scope)))))

(defn public-or-matches?
  "Like [[matches?]] but treats a nil `required-scope` as \"public to any caller\"
   rather than \"internal-only.\" Use this for entities (e.g. MCP resources) whose
   nil-scope contract is documented as public, instead of re-implementing the
   nil-check at every call site."
  [token-scopes required-scope]
  (or (nil? required-scope)
      (matches? token-scopes required-scope)))
