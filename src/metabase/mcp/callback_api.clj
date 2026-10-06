(ns metabase.mcp.callback-api
  "Server-side endpoints for the embedded MCP UI, mounted at `/api/embed-mcp`. They are the whole server surface the
   MCP Apps iframe reaches, and the only routes the iframe's UI credential authenticates.

   Plain Ring handlers rather than `defendpoint`s: each one authenticates the UI credential itself, so the credential
   never becomes a general request credential that the session middleware would carry onto other routes."
  (:require
   [clojure.string :as str]
   [compojure.response]
   [malli.error :as me]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.open-api :as open-api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.derive :as mcp.derive]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.api :as qp.api]
   [metabase.request.core :as request]
   [metabase.server.middleware.session :as mw.session]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ui-credential-header "x-metabase-mcp-ui-auth")

(defn- check-session-header!
  "Validate the `Mcp-Session-Id` header against `user-id` and the session the credential was minted for. Throws an
   `api/check` exception on failure."
  [session-id user-id credential-session-id]
  (api/check (not (str/blank? session-id))
             [400 (tru "Missing Mcp-Session-Id header")])
  (api/check (mcp.session/valid-id? session-id)
             [404 (tru "Invalid or expired session")])
  (api/check (mcp.session/owned-by-user? session-id user-id)
             [404 (tru "Invalid or expired session")])
  (api/check (= credential-session-id session-id)
             [404 (tru "Invalid or expired session")]))

(defn- check-body!
  "Return `body` when it matches `schema`; otherwise throw a 400 describing why."
  [schema body]
  (when-not (mr/validate schema body)
    (throw (ex-info (tru "Invalid request body.")
                    {:status-code 400
                     :errors      (me/humanize (mr/explain schema body))})))
  body)

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

(mu/defn- bootstrap-user :- ::bootstrap-user
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

(defn- bootstrap
  "Everything the MCP Apps iframe needs to mount, so its UI credential never authenticates a general REST endpoint.
   Replaces the iframe's calls to `GET /api/user/current` and `GET /api/session/properties`."
  [_context _request]
  {:status 200
   :body   {:user     (bootstrap-user)
            :settings (setting/user-readable-values-map bootstrap-setting-visibilities)}})

;;; ------------------------------------------------- Feedback ---------------------------------------------------

(def ^:private feedback-text-max-length
  10000)

(def ^:private OptionalFeedbackText
  [:maybe [:string {:max feedback-text-max-length}]])

(def ^:private feedback-body
  [:map {:closed true}
   [:feedback [:map {:closed true}
               [:positive          :boolean]
               [:issue_type        {:optional true} [:maybe [:string {:max 64}]]]
               [:freeform_feedback {:optional true} OptionalFeedbackText]]]
   [:conversation_data [:map {:closed true}
                        [:source [:= "mcp"]]
                        [:prompt {:optional true} OptionalFeedbackText]
                        [:query  {:optional true} OptionalFeedbackText]]]])

(defn- feedback
  "Persist MCP Apps visualization feedback."
  [_context request]
  (let [{:keys [feedback conversation_data]} (check-body! feedback-body (:body request))]
    (metabot.config/check-metabot-enabled!)
    (mcp.db/insert-feedback!
     {:user_id           api/*current-user-id*
      :positive          (:positive feedback)
      :issue_type        (:issue_type feedback)
      :freeform_feedback (:freeform_feedback feedback)
      :prompt            (:prompt conversation_data)
      :query             (:query conversation_data)}))
  api/generic-204-no-content)

;;; -------------------------------------------------- Handles ---------------------------------------------------

(defn- query-by-handle
  "Resolve a query handle to the base64-encoded MBQL the iframe should render. The lookup is scoped to the
   credential's user, not the MCP session, because clients rotate sessions."
  [{:keys [session-id] [handle] :route-params} _request]
  (api/let-404 [{:keys [encoded_query prompt]}
                (mcp.session/resolve-query-handle session-id api/*current-user-id* handle)]
    {:status 200
     :body   {:query encoded_query :prompt prompt}}))

(defn- decode-stored-query
  "The normalized query stored base64-encoded in `encoded`. Throws a 400 when it does not decode to a query."
  [encoded]
  (let [decoded (try
                  (-> encoded u/decode-base64 json/decode+kw)
                  (catch Exception _ nil))
        query   (when (map? decoded)
                  (try
                    (lib-be/normalize-query decoded)
                    (catch Exception _ nil)))]
    (when-not (and (map? query) (pos-int? (:database query)))
      (throw (ex-info (tru "The stored query is invalid.") {:status-code 400})))
    query))

(defn- resolve-handle!
  "The stored row for `handle` owned by the current user, as `{:encoded_query :prompt :query}` where `:query` is
   normalized. Throws a 404 when the user owns no such handle."
  [session-id handle]
  (let [row (api/check-404 (mcp.session/resolve-query-handle session-id api/*current-user-id* handle))]
    (assoc row :query (decode-stored-query (:encoded_query row)))))

(defn- runnable-handle-query!
  "The normalized query stored under the route's handle, after the native-SQL gate for the credential `claims`."
  [{:keys [claims session-id] [handle] :route-params}]
  (let [{:keys [query]} (resolve-handle! session-id handle)]
    (query-guards/check-mcp-ui-native-query! claims query)
    query))

(defn- run-handle
  "Run the query stored under the route's handle, the way `POST /api/dataset` runs an ad-hoc query. A query in the
   request body is ignored."
  [context _request]
  (qp.api/run-adhoc-query (runnable-handle-query! context)))

(def ^:private pivot-body
  [:map
   [:pivot_rows         {:optional true} [:maybe [:sequential ms/IntGreaterThanOrEqualToZero]]]
   [:pivot_cols         {:optional true} [:maybe [:sequential ms/IntGreaterThanOrEqualToZero]]]
   [:show_row_totals    {:optional true} [:maybe :boolean]]
   [:show_column_totals {:optional true} [:maybe :boolean]]])

(defn- pivot-handle
  "Run the query stored under the route's handle as a pivot query, the way `POST /api/dataset/pivot` does. Only the
   body's pivot layout is read: `pivot_rows` and `pivot_cols`, which pick among the stored query's breakouts, and the
   two totals flags."
  [context request]
  (let [{:keys [pivot_rows pivot_cols show_row_totals show_column_totals]}
        (check-body! pivot-body (or (:body request) {}))]
    (qp.api/run-adhoc-pivot-query (cond-> (runnable-handle-query! context)
                                    pivot_rows                 (assoc :pivot-rows pivot_rows)
                                    pivot_cols                 (assoc :pivot-cols pivot_cols)
                                    (some? show_row_totals)    (assoc :show-row-totals show_row_totals)
                                    (some? show_column_totals) (assoc :show-column-totals show_column_totals)))))

(defn- handle-query-metadata
  "The metadata the iframe needs for the query stored under the route's handle, as `POST /api/dataset/query_metadata`
   returns it."
  [context _request]
  {:status 200
   :body   (qp.api/adhoc-query-metadata (runnable-handle-query! context))})

(def ^:private remapping-body
  [:map
   [:parameter [:map [:id ms/NonBlankString]]]
   [:value     [:ref ::lib.schema.parameter/parameter.value]]])

(defn- template-tag-parameter
  "The parameter and field ids for the field-filter template tag of `query` whose id is `parameter-id`, or nil."
  [query parameter-id]
  (some (fn [{:keys [id type widget-type dimension] tag-name :name}]
          (when (and (= id parameter-id) (= type :dimension))
            (let [[_ _ field-id] dimension]
              (when (pos-int? field-id)
                {:parameter {:id     id
                             :type   (or widget-type :category)
                             :slug   tag-name
                             :target [:dimension [:template-tag tag-name]]}
                 :field-ids [field-id]}))))
        (lib/template-tags query)))

(defn- handle-parameter-remapping
  "The remapped value of `value` for a field-filter parameter of the query stored under the route's handle, as
   `POST /api/dataset/parameter/remapping` returns it. The parameter is named by its id; its field comes from the
   stored query, never from the request."
  [context request]
  (let [{{parameter-id :id} :parameter value :value} (check-body! remapping-body (:body request))
        query (runnable-handle-query! context)
        {:keys [parameter field-ids]} (api/check-404 (template-tag-parameter
                                                      (lib/query (lib-be/application-database-metadata-provider
                                                                  (:database query))
                                                                 query)
                                                      parameter-id))]
    {:status 200
     :body   (qp.api/param-remapped-value field-ids parameter value)}))

;;; -------------------------------------------------- Derive ----------------------------------------------------

(defn- group-policy-permits-derive?
  "Whether the group policy of the current user permits storing `derived-query`, derived from `base-query`, as a new
   handle. Returns true when it does."
  [_base-query _derived-query]
  true)

(defn- derive-handle!
  "Derive a new query from the query stored under `handle` by `operations`, store it under a new handle owned by the
   current user, and return `{:handle :query}` where `:query` is the new query base64-encoded."
  [session-id handle operations]
  (let [{:keys [query prompt]} (resolve-handle! session-id handle)
        ;; Before any column is read, so a user who lost access cannot learn which columns exist.
        _       (query-guards/check-token-query-permissions! query)
        base    (lib/query (lib-be/application-database-metadata-provider (:database query)) query)
        derived (mcp.derive/derive-query base operations)]
    (api/check-403 (group-policy-permits-derive? base derived))
    ;; Serialization drops the base query's parameters, which target its columns; a drill to another table would
    ;; leave them pointing at columns the derived query does not have.
    (let [encoded (-> (lib/prepare-for-serialization derived)
                      json/encode
                      u/encode-base64)]
      {:handle (mcp.session/store-handle! session-id api/*current-user-id* encoded prompt)
       :query  encoded})))

(mr/def ::derive-body
  [:map {:closed true}
   [:operations [:sequential {:min 1 :max 10} ::mcp.derive/operation]]])

(defn- derive-query
  "Derive a new handle from the route's handle by the operations in the body, and return the new handle and its
   base64-encoded query."
  [{:keys [session-id] [handle] :route-params} request]
  (let [{:keys [operations]} (check-body! ::derive-body (:body request))]
    {:status 200
     :body   (derive-handle! session-id handle operations)}))

(mr/def ::drills-body
  [:map {:closed true}
   [:handle    ms/UUIDString]
   [:operation ::mcp.derive/drill-operation]])

(defn- store-drill
  "Derive the drill-through the user clicked from the handle they clicked it on, and return the new handle. The iframe
   threads the handle into the agent message so the `render_drill_through` tool renders it."
  [{:keys [session-id]} request]
  (let [{:keys [handle operation]} (check-body! ::drills-body (:body request))]
    {:status 200
     :body   {:handle (:handle (derive-handle! session-id handle [operation]))}}))

;;; -------------------------------------------------- Routing ---------------------------------------------------

(def ^:private uuid-pattern
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

(def ^:private route-table
  "Every route the iframe reaches: `[method path-pattern scope handler]`. `scope` is what the minting MCP session must
   have held, or nil when a valid credential is the whole requirement. `path-pattern` must match the whole path;
   its groups become the handler's `:route-params`."
  [[:get  #"/bootstrap"                                     nil                           bootstrap]
   [:post #"/feedback"                                      nil                           feedback]
   [:post #"/drills"                                        metabot.scope/agent-query-run store-drill]
   [:get  (re-pattern (str "/queries/(" uuid-pattern ")")) metabot.scope/agent-query-run query-by-handle]
   [:post (re-pattern (str "/queries/(" uuid-pattern ")/derive"))
    metabot.scope/agent-query-run derive-query]
   [:post (re-pattern (str "/queries/(" uuid-pattern ")/run"))
    metabot.scope/agent-query-run run-handle]
   [:post (re-pattern (str "/queries/(" uuid-pattern ")/pivot"))
    metabot.scope/agent-query-run pivot-handle]
   [:post (re-pattern (str "/queries/(" uuid-pattern ")/query_metadata"))
    metabot.scope/agent-query-run handle-query-metadata]
   [:post (re-pattern (str "/queries/(" uuid-pattern ")/parameter/remapping"))
    metabot.scope/agent-query-run handle-parameter-remapping]])

(defn- match-route
  "The route in [[route-table]] for `method` + `path`, with its `:route-params`, or nil."
  [method path]
  (some (fn [[route-method pattern scope handler]]
          (when (= route-method method)
            (when-let [match (re-matches pattern (or path ""))]
              {:scope        scope
               :handler      handler
               :route-params (when (vector? match) (vec (rest match)))})))
        route-table))

(defn- holds-scope?
  "Whether the credential `claims` hold `required-scope`, by the same literal rule as the MCP tools; nil
   `required-scope` means none is needed."
  [claims required-scope]
  (mcp.scope/public-or-matches? (:token-scopes claims) required-scope))

(defn- respond-with
  "Send `response`, which may be a Ring response map or a streaming response."
  [response request respond raise]
  (if (map? response)
    (respond response)
    (compojure.response/send response request respond raise)))

(defn- handle-route
  "Authenticate the UI credential on `request` and serve `route` as the credential's user. The credential
   authenticates only while the OAuth access token it was minted from still authenticates its user at the MCP
   endpoint."
  [{:keys [scope handler route-params]} request respond raise]
  (let [claims (mcp.session/resolve-ui-credential (get-in request [:headers ui-credential-header]))
        user   (when (oauth-server/live-mcp-access-token? (:tid claims) (:uid claims))
                 (mw.session/user-info-for-id (:uid claims)))]
    (cond
      (not user)
      (respond {:status 401 :body "Unauthenticated"})

      (not (holds-scope? claims scope))
      (raise (ex-info (tru "This client was not granted the scope this request needs.")
                      {:status-code 403}))

      :else
      ;; The response is sent inside the bindings: a body may hold lazy values that realize as it is encoded. The auth
      ;; method marks the queries the iframe runs in usage analytics.
      (analytics/with-auth-method! "mcp-ui"
        (request/do-with-current-user
         user
         (fn []
           (let [session-id (get-in request [:headers "mcp-session-id"])]
             (check-session-header! session-id api/*current-user-id* (:sid claims))
             (respond-with (handler {:claims       claims
                                     :session-id   session-id
                                     :route-params route-params}
                                    request)
                           request respond raise))))))))

(defn- handler
  [request respond raise]
  (if-let [route (match-route (:request-method request) ((some-fn :path-info :uri) request))]
    (try
      (handle-route route request respond raise)
      (catch Throwable e
        (raise e)))
    (respond nil)))

(def ^{:arglists '([request respond raise])} routes
  "Iframe routes mounted at `/api/embed-mcp`. MCP-feature gated; each route authenticates the UI credential itself."
  (mcp.validation/+mcp-enabled
   ;; Iframe-only routes, so they stay out of the published API docs.
   (open-api/handler-with-open-api-spec handler (constantly nil))))
