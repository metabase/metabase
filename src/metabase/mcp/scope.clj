(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   Scope strings match exactly: a wildcard such as `*` or `agent:*` is not a registered scope and covers
   nothing. nil token-scopes (internal callers) and the `::scope/unrestricted` sentinel (session auth or
   unscoped JWT) both bypass the check."
  (:require
   [metabase.api.macros.scope :as api.scope]))

(defn matches?
  "Does `token-scopes` grant access to an entity with the given `required-scope`, or any member of a set of
   alternative scopes?
   - nil `token-scopes` always matches (internal callers).
   - `::api.scope/unrestricted` in `token-scopes` always matches.
   - A set of required scopes matches when any member matches.
   - nil `required-scope` only matches the two cases above (callers that want
     \"public to any authenticated MCP user\" should use [[public-or-matches?]]).
   - Otherwise `token-scopes` must hold `required-scope` exactly; wildcards cover nothing."
  [token-scopes required-scope]
  (or (nil? token-scopes)
      (contains? token-scopes ::api.scope/unrestricted)
      (if (set? required-scope)
        (boolean (some #(matches? token-scopes %) required-scope))
        (boolean (and (some? required-scope)
                      (contains? token-scopes required-scope))))))

(defn public-or-matches?
  "Like [[matches?]] but treats a nil `required-scope` as \"public to any caller\"
   rather than \"internal-only.\" Use this for entities (e.g. MCP resources) whose
   nil-scope contract is documented as public, instead of re-implementing the
   nil-check at every call site."
  [token-scopes required-scope]
  (or (nil? required-scope)
      (matches? token-scopes required-scope)))
