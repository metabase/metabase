(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   Only a named scope string grants anything, and only by exact match. A wildcard such as `*` or `agent:*`,
   nil token-scopes, and the `::api.scope/unrestricted` sentinel are not MCP scopes and match nothing.")

(defn matches?
  "Does `token-scopes` hold `required-scope` exactly, or any member of a set of alternative scopes? nil
   `token-scopes` and nil `required-scope` match nothing."
  [token-scopes required-scope]
  (if (set? required-scope)
    (boolean (some #(matches? token-scopes %) required-scope))
    (boolean (and (string? required-scope)
                  (contains? token-scopes required-scope)))))

(defn public-or-matches?
  "Like [[matches?]] but treats a nil `required-scope` as \"public to any caller\"
   rather than \"internal-only.\" Use this for entities (e.g. MCP resources) whose
   nil-scope contract is documented as public, instead of re-implementing the
   nil-check at every call site."
  [token-scopes required-scope]
  (or (nil? required-scope)
      (matches? token-scopes required-scope)))
