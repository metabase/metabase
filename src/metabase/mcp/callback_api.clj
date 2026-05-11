(ns metabase.mcp.callback-api
  "Iframe-callback endpoints for the embedded MCP UI. The MCP iframe POSTs here to
   stash query payloads server-side so the agent never has to carry them in the
   model context — it just receives a handle UUID it can pass to the corresponding
   MCP tool. Mounted as a sibling of `/api/mcp` so the JSON-RPC handler doesn't
   have to special-case non-protocol routes."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(def ^:private max-view-contexts 5)

(defn- mcp-session-id-from-headers
  [request]
  (get-in request [:headers "mcp-session-id"]))

(defn- check-session-header!
  "Validate the `Mcp-Session-Id` header against `user-id`. Throws an api/check
   exception on failure so defendpoint surfaces the right status code."
  [session-id user-id]
  (api/check (not (str/blank? session-id))
             [400 (tru "Missing Mcp-Session-Id header")])
  (api/check (mcp.session/valid-id? session-id)
             [404 (tru "Invalid or expired session")])
  (api/check (mcp.session/owned-by-user? session-id user-id)
             [404 (tru "Invalid or expired session")]))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/drills"
  "Stash a base64-encoded MBQL query for the iframe's pending drill-through and
   return a handle UUID the iframe will thread into the agent message so the
   `render_drill_through` tool can fetch it."
  [_route-params
   _query-params
   {:keys [encodedQuery]} :- [:map [:encodedQuery ms/NonBlankString]]
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id*)
    {:handle (mcp.session/store-handle! session-id api/*current-user-id* encodedQuery)}))

(def ^:private view-context-schema
  [:map
   [:viewInstanceId ms/NonBlankString]
   [:activeViewRole {:optional true} [:maybe ms/NonBlankString]]
   [:visibleViews {:optional true} [:maybe [:sequential [:map-of [:or :keyword :string] :any]]]]
   [:recentViews {:optional true} [:maybe [:sequential [:map-of [:or :keyword :string] :any]]]]])

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/context"
  "Store compact view context for one MCP iframe. Drill query payloads are
   converted to server-side query handles before persistence so follow-up NLQ
   can reference visible Metabase views without putting raw MBQL into model
   context."
  [_route-params
   _query-params
   body :- view-context-schema
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id*)
    (let [context (mcp.session/upsert-view-context! session-id api/*current-user-id* body)]
      {:context  context
       :contexts (mcp.session/read-view-contexts session-id max-view-contexts)})))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/context/:view-instance-id"
  "Remove compact view context for one MCP iframe during MCP app teardown."
  [{:keys [view-instance-id]} :- [:map [:view-instance-id ms/NonBlankString]]
   _query-params
   _body
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id*)
    (mcp.session/delete-view-context! session-id api/*current-user-id* view-instance-id)
    {:ok true}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/context/:view-instance-id/touch"
  "Refresh one MCP iframe view context heartbeat and return currently active
   contexts for the session."
  [{:keys [view-instance-id]} :- [:map [:view-instance-id ms/NonBlankString]]
   _query-params
   _body
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id*)
    (mcp.session/touch-view-context! session-id api/*current-user-id* view-instance-id)
    {:contexts (mcp.session/read-view-contexts session-id max-view-contexts)}))

(def ^{:arglists '([request respond raise])} routes
  "Iframe-callback routes mounted at `/api/embed-mcp`. MCP-feature gated; auth is
   handled by the upstream `+auth` middleware in api-routes."
  (mcp.validation/+mcp-enabled (api.macros/ns-handler *ns*)))
