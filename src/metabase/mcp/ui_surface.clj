(ns metabase.mcp.ui-surface
  "The server-side API surface an MCP Apps UI credential may reach, and what each route on it costs.

   A UI credential is deliberately not a general Metabase API credential. It is minted from an MCP session
   whose token may hold nothing but `agent:query:run`, so what it reaches has to be decided here rather than
   inherited from whatever the embedded app happens to call."
  (:require
   [metabase.api.macros.scope :as scope]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(def request-surface
  "`[method uri]` -> the scope the minting MCP session must hold to use that route, or nil when holding a valid
   credential is the whole requirement.

   Two gates, not one. A route absent from this map is not authenticated at all: the credential resolver
   returns nil and the request falls through as anonymous. A route present in it is served only while the
   credential's signed scope claim satisfies the value; otherwise the request is authenticated but not
   scope-checked, and `ensure-scopes-checked` refuses it. Adding a route is therefore a decision about which
   scope pays for it, and a route reached by mistake — a routing change, a new alias — fails closed.

   `agent:query:run` on the query routes is the scope that already bought the iframe: the v2 shell resources
   in [[metabase.mcp.v2.resources]] declare it, so a client that can mount the iframe at all holds it. v1's
   shell declares a different scope and mints `:legacy` credentials, which [[scope-satisfied?]] exempts."
  {[:get  "/api/embed-mcp/bootstrap"]         nil
   [:post "/api/embed-mcp/feedback"]          nil
   [:post "/api/embed-mcp/drills"]            metabot.scope/agent-query-run
   [:post "/api/dataset"]                     metabot.scope/agent-query-run
   [:post "/api/dataset/pivot"]               metabot.scope/agent-query-run
   [:post "/api/dataset/query_metadata"]      metabot.scope/agent-query-run
   [:post "/api/dataset/parameter/remapping"] metabot.scope/agent-query-run})

(defn on-surface?
  "Whether a UI credential may authenticate `method` + `uri` at all."
  [method uri]
  (contains? request-surface [method uri]))

(defn scope-satisfied?
  "Whether a credential with `claims` may be served `method` + `uri`.

   Credentials minted before the scope claim existed decode to an empty scope set, so a rolling deploy
   degrades a v2 credential to the routes that require no scope rather than to full access. v1's frozen
   surface mints claimless credentials by design and is stamped `:legacy`; it keeps the reach it had, the
   same exemption [[metabase.agent-api.query-guards/check-mcp-ui-native-query!]] makes.

   `::scope/unrestricted` in the claim satisfies every route, matching `enforce-scope` and
   `ensure-scopes-checked` rather than making this table the one place the sentinel means less. It only
   appears when the minting MCP session was itself unrestricted — a cookie-authenticated caller — so the
   credential reaches nothing its holder could not already reach with their own session."
  [method uri {:keys [legacy token-scopes]}]
  (when-let [entry (find request-surface [method uri])]
    (boolean (or (true? legacy)
                 (nil? (val entry))
                 (contains? token-scopes ::scope/unrestricted)
                 (scope/scope-satisfied? token-scopes (val entry))))))
