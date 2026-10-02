(ns metabase.mcp.callback-api
  "Server-side endpoints for the embedded MCP UI, mounted at `/api/embed-mcp`. They are the whole server surface the
   MCP Apps iframe reaches, and the only routes the iframe's UI credential authenticates.

   Plain Ring handlers rather than `defendpoint`s: each one authenticates the UI credential itself, so the credential
   never becomes a general request credential that the session middleware would carry onto other routes."
  (:require
   [clojure.string :as str]
   [compojure.response]
   [malli.error :as me]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.api.response :as api.response]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.server.middleware.session :as mw.session]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
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

(def ^:private drills-body
  [:map {:closed true} [:encodedQuery ms/NonBlankString]])

(defn- store-drill
  "Stash a base64-encoded MBQL query for the iframe's pending drill-through and return a handle UUID the iframe will
   thread into the agent message so the `render_drill_through` tool can fetch it."
  [{:keys [session-id]} request]
  (let [{:keys [encodedQuery]} (check-body! drills-body (:body request))]
    {:status 200
     :body   {:handle (mcp.session/store-handle! session-id api/*current-user-id* encodedQuery)}}))

(defn- query-by-handle
  "Resolve a query handle to the base64-encoded MBQL the iframe should render. The lookup is scoped to the
   credential's user, not the MCP session, because clients rotate sessions."
  [{:keys [session-id] [handle] :route-params} _request]
  (api/let-404 [{:keys [encoded_query prompt]}
                (mcp.session/resolve-query-handle session-id api/*current-user-id* handle)]
    {:status 200
     :body   {:query encoded_query :prompt prompt}}))

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
   [:get  (re-pattern (str "/queries/(" uuid-pattern ")")) metabot.scope/agent-query-run query-by-handle]])

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

(defn- scope-satisfied?
  "Whether the credential `claims` hold `required-scope`, or nil `required-scope` means none is needed. Only the
   literal scope set signed into the claim counts."
  [claims required-scope]
  (or (nil? required-scope)
      (let [granted (:token-scopes claims)]
        (and (set? granted)
             (scope/scope-satisfied? (into #{} (filter string?) granted) required-scope)))))

(defn- handle-route
  "Authenticate the UI credential on `request` and serve `route` as the credential's user."
  [{:keys [scope handler route-params]} request]
  (let [claims (mcp.session/resolve-ui-credential (get-in request [:headers ui-credential-header]))
        user   (some-> (:uid claims) mw.session/user-info-for-id)]
    (cond
      (not user)
      api.response/response-unauthentic

      (not (scope-satisfied? claims scope))
      (throw (ex-info (tru "This client was not granted the scope this request needs.")
                      {:status-code 403}))

      :else
      (request/do-with-current-user
       user
       (fn []
         (let [session-id (get-in request [:headers "mcp-session-id"])]
           (check-session-header! session-id api/*current-user-id* (:sid claims))
           (handler {:claims       claims
                     :session-id   session-id
                     :route-params route-params}
                    request)))))))

(defn- respond-with
  "Send `response`, which may be a Ring response map or a streaming response."
  [response request respond raise]
  (if (map? response)
    (respond response)
    (compojure.response/send response request respond raise)))

(defn- handler
  [request respond raise]
  (if-let [route (match-route (:request-method request) ((some-fn :path-info :uri) request))]
    (try
      (respond-with (handle-route route request) request respond raise)
      (catch Throwable e
        (raise e)))
    (respond nil)))

(def ^{:arglists '([request respond raise])} routes
  "Iframe routes mounted at `/api/embed-mcp`. MCP-feature gated; each route authenticates the UI credential itself."
  (mcp.validation/+mcp-enabled handler))
