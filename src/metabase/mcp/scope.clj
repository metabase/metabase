(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   MCP compares scopes literally: a token grants exactly the scope strings it holds. A wildcard grant covers nothing,
   and nil token-scopes or a keyword sentinel such as the REST API's unrestricted marker grant nothing. No MCP caller
   skips the check.")

(defn matches?
  "Does `token-scopes` grant access to an entity with the given `required-scope`, or any member of a set of
   alternative scopes?
   - A set of required scopes matches when any member matches.
   - nil `required-scope` matches nothing (callers that want \"public to any authenticated MCP user\" should use
     [[public-or-matches?]]).
   - Otherwise matches when `token-scopes` holds `required-scope` literally. MCP honors literal scopes only, so a
     wildcard grant such as `agent:*` matches nothing it would cover."
  [token-scopes required-scope]
  (if (set? required-scope)
    (boolean (some #(matches? token-scopes %) required-scope))
    (boolean (and (some? required-scope)
                  (contains? (set (filter string? token-scopes)) required-scope)))))

(defn public-or-matches?
  "Like [[matches?]] but treats a nil `required-scope` as \"public to any authenticated MCP caller\". Nil
   `token-scopes` still grant nothing else. Use this for entities (e.g. MCP resources) whose
   nil-scope contract is documented as public, instead of re-implementing the
   nil-check at every call site."
  [token-scopes required-scope]
  (or (nil? required-scope)
      (matches? token-scopes required-scope)))
