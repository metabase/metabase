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

   Two gates, not one. A route absent from the surface is not authenticated at all: the credential resolver
   returns nil and the request falls through as anonymous. A route present on it is served only while the
   credential's signed scope claim satisfies the value; otherwise the request is authenticated but not
   scope-checked, and `ensure-scopes-checked` refuses it. Adding a route is therefore a decision about which
   scope pays for it, and a route reached by mistake — a routing change, a new alias — fails closed.

   `agent:query:run` is the scope that already bought the iframe: the v2 shell resources in
   [[metabase.mcp.v2.resources]] declare it, so a client that can mount the iframe at all holds it."
  {[:get  "/api/embed-mcp/bootstrap"]         nil
   [:post "/api/embed-mcp/feedback"]          nil
   [:post "/api/embed-mcp/drills"]            metabot.scope/agent-query-run
   [:post "/api/dataset"]                     metabot.scope/agent-query-run
   [:post "/api/dataset/pivot"]               metabot.scope/agent-query-run
   [:post "/api/dataset/query_metadata"]      metabot.scope/agent-query-run
   [:post "/api/dataset/parameter/remapping"] metabot.scope/agent-query-run})

(def parameterized-request-surface
  "The part of the surface whose uri carries a path parameter, and so cannot be written as a literal
   `[method uri]` pair. Values mean what they do in [[request-surface]]: the scope the route costs, or nil.

   Each regex must match the whole uri and pin every path segment it does not parameterize, so an entry
   here stays exactly as narrow as a literal one."
  {[:get #"/api/embed-mcp/queries/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"]
   metabot.scope/agent-query-run})

(defn- surface-entry
  "The map entry for `method` + `uri` from either surface, or nil when the route is on neither.

   The entry's value is what the route costs, so a free route is still an entry: nil from this fn means
   off-surface, never free."
  [method uri]
  (or (find request-surface [method uri])
      (some (fn [[[entry-method pattern] :as entry]]
              (when (and (= entry-method method)
                         (re-matches pattern uri))
                entry))
            parameterized-request-surface)))

(defn on-surface?
  "Whether a UI credential may authenticate `method` + `uri` at all."
  [method uri]
  (some? (surface-entry method uri)))

(defn scope-satisfied?
  "Whether a credential with `claims` may be served `method` + `uri`.

   Credentials minted before the scope claim existed decode to an empty scope set, so a rolling deploy
   degrades a credential to the routes that cost no scope rather than to full access.

   `::scope/unrestricted` in the claim satisfies every route, matching `enforce-scope` and
   `ensure-scopes-checked` rather than making this table the one place the sentinel means less. It only
   appears when the minting MCP session was itself unrestricted — a cookie-authenticated caller — so the
   credential reaches nothing its holder could not already reach with their own session."
  [method uri {:keys [token-scopes]}]
  (when-let [entry (surface-entry method uri)]
    (boolean (or (nil? (val entry))
                 (contains? token-scopes ::scope/unrestricted)
                 (scope/scope-satisfied? token-scopes (val entry))))))
