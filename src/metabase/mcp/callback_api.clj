(ns metabase.mcp.callback-api
  "Iframe-callback endpoints for the embedded MCP UI. The MCP iframe POSTs here to
   stash query payloads server-side so the agent never has to carry them in the
   model context — it just receives a handle UUID it can pass to the corresponding
   MCP tool. Mounted as a sibling of `/api/metabase-mcp` so the JSON-RPC handler doesn't
   have to special-case non-protocol routes."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.metabot.config :as metabot.config]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- mcp-session-id-from-headers
  [request]
  (get-in request [:headers "mcp-session-id"]))

(defn- check-session-header!
  "Validate the `Mcp-Session-Id` header against `user-id`. Throws an api/check
   exception on failure so defendpoint surfaces the right status code."
  [session-id user-id request]
  (api/check (not (str/blank? session-id))
             [400 (tru "Missing Mcp-Session-Id header")])
  (api/check (mcp.session/valid-id? session-id)
             [404 (tru "Invalid or expired session")])
  (api/check (mcp.session/owned-by-user? session-id user-id)
             [404 (tru "Invalid or expired session")])
  ;; A UI credential carries the session it was minted for. Normal browser
  ;; sessions intentionally continue to use the existing ownership check alone.
  (when-let [credential-session-id (:mcp-ui-session-id request)]
    (api/check (= credential-session-id session-id)
               [404 (tru "Invalid or expired session")])))

(def ^:private feedback-text-max-length
  10000)

(def ^:private OptionalFeedbackText
  [:maybe [:string {:max feedback-text-max-length}]])

(defn- persist-mcp-feedback!
  [{:keys [feedback conversation_data]}]
  (t2/insert! :model/McpFeedback
              {:user_id           api/*current-user-id*
               :positive          (:positive feedback)
               :issue_type        (:issue_type feedback)
               :freeform_feedback (:freeform_feedback feedback)
               :prompt            (:prompt conversation_data)
               :query             (:query conversation_data)}))

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
    (check-session-header! session-id api/*current-user-id* request)
    {:handle (mcp.session/store-handle! session-id api/*current-user-id* encodedQuery)}))

(api.macros/defendpoint :get "/queries/:handle" :- [:map
                                                    [:query  ms/NonBlankString]
                                                    [:prompt [:maybe :string]]]
  "Resolve a query handle to the base64-encoded MBQL the iframe should render.

   This is how the v2 MCP Apps tools keep result data out of the model context: `visualize_query`
   and `render_drill_through` return only a handle, and the iframe exchanges it here using the
   scoped UI credential it was rendered with. Access is keyed on that `(user, session)` pair —
   the handle alone is not a bearer credential."
  [{:keys [handle]} :- [:map [:handle ms/UUIDString]]
   _query-params
   _body
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id* request)
    (api/let-404 [{:keys [encoded_query prompt]}
                  (mcp.session/resolve-query-handle session-id api/*current-user-id* handle)]
      {:query encoded_query :prompt prompt})))

(api.macros/defendpoint :post "/feedback" :- [:map
                                              [:status [:= 204]]
                                              [:body :nil]]
  "Persist MCP Apps visualization feedback."
  [_route-params
   _query-params
   body :- [:map
            [:feedback [:map
                        [:positive          :boolean]
                        [:issue_type        {:optional true} [:maybe [:string {:max 64}]]]
                        [:freeform_feedback {:optional true} OptionalFeedbackText]]]
            [:conversation_data [:map
                                 [:source [:= "mcp"]]
                                 [:prompt {:optional true} OptionalFeedbackText]
                                 [:query  {:optional true} OptionalFeedbackText]]]]
   request]
  (let [session-id (mcp-session-id-from-headers request)
        _          (check-session-header! session-id api/*current-user-id* request)]
    (metabot.config/check-metabot-enabled!)
    (persist-mcp-feedback! body))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Iframe-callback routes mounted at `/api/embed-mcp`. Gated on the MCP surface that renders the
   iframe; auth is handled by the upstream `+auth` middleware in api-routes.

   These serve an iframe rendered inside a per-user MCP conversation, so they inherit the MCP
   surface's refusal of API keys — session ownership alone must not be all that stands between a
   shared, unbilled credential and a minted query handle."
  (-> (api.macros/ns-handler *ns*)
      mcp.validation/+mcp-enabled
      mcp.validation/+no-api-key-auth))
