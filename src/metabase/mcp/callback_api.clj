(ns metabase.mcp.callback-api
  "Server-side endpoints for the embedded MCP UI, mounted at `/api/embed-mcp`. Two kinds of route live here:

   - Iframe callbacks: the iframe POSTs query payloads here to stash them server-side so the agent never has to
     carry them in the model context — it just receives a handle UUID it can pass to the corresponding MCP tool.
   - Bootstrap: the projection of the user and settings the iframe needs to mount, so the UI credential never has
     to authenticate the general `/api/user/current` and `/api/session/properties` endpoints.

   Mounted as a sibling of `/api/metabase-mcp` so the JSON-RPC handler doesn't have to special-case non-protocol
   routes."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.metabot.config :as metabot.config]
   [metabase.permissions.core :as perms]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
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

;;; ------------------------------------------------- Bootstrap --------------------------------------------------

(def ^:private bootstrap-setting-visibilities
  "Setting visibilities the iframe may read: exactly what a non-admin authenticated user sees, even when the
   credential holder is an admin. The iframe renders one visualization and needs no admin-only setting, and a
   credential minted from a narrow MCP scope must not widen into instance configuration."
  #{:public :authenticated :admin-write-authed-read})

(mr/def ::bootstrap-user
  "The projection of the current user the MCP iframe may read. Closed on purpose: a field belongs here only when
   something the iframe renders reads it, so widening the projection is a decision someone has to make in this file
   rather than a side effect of the shared `GET /api/user/current` response growing.

   Deliberately absent: `email`, `login_attributes`, `jwt_attributes`, `attributes`, `sso_source`, `group_ids` and
   the advanced-permissions flags. Nothing in the visualization reads them, and they are what made the general
   endpoint a scope-escalation target. The name fields are absent for the same reason: the iframe displays no
   user, and `common_name` falls back to the email address when a user has neither first nor last name."
  [:map {:closed true}
   [:id                     ms/PositiveInt]
   [:locale                 [:maybe :string]]
   [:is_superuser           :boolean]
   [:is_data_analyst        :boolean]
   [:is_qbnewb              :boolean]
   ;; the holder's own tenant; `getIsTenantUser` on the client branches on it
   [:tenant_id              [:maybe ms/PositiveInt]]
   [:personal_collection_id [:maybe ms/PositiveInt]]
   [:permissions [:map {:closed true}
                  [:can_create_queries        :boolean]
                  [:can_create_native_queries :boolean]]]])

(defn- bootstrap-user
  "The [[::bootstrap-user]] projection of the current user."
  []
  (let [user (api/check-404 @api/*current-user*)
        {:keys [can-create-queries can-create-native-queries]}
        (perms/query-creation-capabilities (:id user))]
    (-> user
        (t2/hydrate :personal_collection_id)
        (select-keys [:id :locale :is_superuser :is_data_analyst :is_qbnewb
                      :tenant_id :personal_collection_id])
        (assoc :permissions {:can_create_queries        can-create-queries
                             :can_create_native_queries can-create-native-queries}))))

(api.macros/defendpoint :get "/bootstrap" :- [:map {:closed true}
                                              [:user     ::bootstrap-user]
                                              [:settings [:map-of :keyword :any]]]
  "Everything the MCP Apps iframe needs to mount, so its UI credential never authenticates a general REST endpoint.
   Replaces the iframe's calls to `GET /api/user/current` and `GET /api/session/properties`."
  [_route-params
   _query-params
   _body
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id* request)
    {:user     (bootstrap-user)
     :settings (setting/user-readable-values-map bootstrap-setting-visibilities)}))

(def ^:private feedback-text-max-length
  10000)

(def ^:private OptionalFeedbackText
  [:maybe [:string {:max feedback-text-max-length}]])

(defn- persist-mcp-feedback!
  [{:keys [feedback conversation_data]}]
  (mcp.db/insert-feedback!
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
   scoped UI credential it was rendered with. The lookup is user-scoped (see
   [[metabase.mcp.session/find-handle-row]]) and the credential is accepted only on the MCP UI
   request surface, so a handle on its own is not a bearer credential."
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
  "Iframe-callback routes mounted at `/api/embed-mcp`. MCP-feature gated; auth is
   handled by the upstream `+auth` middleware in api-routes."
  (mcp.validation/+mcp-enabled (api.macros/ns-handler *ns*)))
