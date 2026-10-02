(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources.

   Wraps [[metabase.api.macros.scope/scope-satisfied?]] with the conventions used by
   MCP entry points: only scope strings are compared, so nil token-scopes, and a keyword sentinel such as the REST
   API's unrestricted marker, grant nothing. No MCP caller skips the check."
  (:require
   [metabase.api.macros.scope :as api.scope]))

(defn matches?
  "Does `token-scopes` grant access to an entity with the given `required-scope`, or any member of a set of
   alternative scopes?
   - A set of required scopes matches when any member matches.
   - nil `required-scope` matches nothing (callers that want \"public to any authenticated MCP user\" should use
     [[public-or-matches?]]).
   - Otherwise delegates wildcard/exact matching to [[api.scope/scope-satisfied?]]."
  [token-scopes required-scope]
  (if (set? required-scope)
    (boolean (some #(matches? token-scopes %) required-scope))
    (boolean (and (some? required-scope)
                  (api.scope/scope-satisfied? (into #{} (filter string?) token-scopes) required-scope)))))

(defn public-or-matches?
  "Like [[matches?]] but treats a nil `required-scope` as \"public to any authenticated MCP caller\". Nil
   `token-scopes` still grant nothing else. Use this for entities (e.g. MCP resources) whose
   nil-scope contract is documented as public, instead of re-implementing the
   nil-check at every call site."
  [token-scopes required-scope]
  (or (nil? required-scope)
      (matches? token-scopes required-scope)))
