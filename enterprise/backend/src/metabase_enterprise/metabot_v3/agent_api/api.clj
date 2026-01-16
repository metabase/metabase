(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.settings :as metabot-settings]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Schemas ------------------------------------------------------

;; Response schemas for the Agent API.
;; - Use snake_case keys in schema definitions (JSON convention)
;; - Use :encode/api transformers to convert kebab-case data from internal functions
;; - Convert keyword enum values (like :table, :metric) to strings for JSON

(defn- ->snake_case-keys
  "Convert all map keys to snake_case. Used for encoding responses."
  [m]
  (when m
    (update-keys m u/->snake_case_en)))

(defn- keyword->string
  "Convert a keyword to its name string, or return non-keywords as-is."
  [x]
  (if (keyword? x) (name x) x))

(mr/def ::field-type
  [:enum {:encode/api keyword->string}
   :boolean :date :datetime :time :number :string])

(mr/def ::field
  [:map {:encode/api ->snake_case-keys}
   [:field_id :string]
   [:name :string]
   [:type {:optional true} [:maybe ::field-type]]
   [:description {:optional true} [:maybe :string]]
   [:database_type {:optional true} [:maybe :string]]
   [:semantic_type {:optional true} [:maybe :string]]
   [:field_values {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::entity-type
  [:enum {:encode/api keyword->string}
   :model :table :metric])

(mr/def ::basic-metric
  [:map {:encode/api ->snake_case-keys}
   [:id :int]
   [:type [:= {:encode/api keyword->string} :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe :string]]])

(mr/def ::segment
  [:map {:encode/api ->snake_case-keys}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::related-table
  [:map {:encode/api ->snake_case-keys}
   [:id :int]
   [:type ::entity-type]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_engine {:optional true} [:maybe :keyword]]
   [:database_schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:fields {:optional true} [:maybe [:sequential ::field]]]
   [:related_by {:optional true} [:maybe :string]]])

(mr/def ::table-response
  [:map {:encode/api ->snake_case-keys}
   [:id :int]
   [:type ::entity-type]
   [:name :string]
   [:display_name :string]
   [:database_id :int]
   [:database_engine :keyword]
   [:database_schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:fields [:sequential ::field]]
   [:related_tables {:optional true} [:maybe [:sequential ::related-table]]]
   [:metrics {:optional true} [:maybe [:sequential ::basic-metric]]]
   [:segments {:optional true} [:maybe [:sequential ::segment]]]])

(mr/def ::full-metric-response
  [:map {:encode/api ->snake_case-keys}
   [:id :int]
   [:type [:= {:encode/api keyword->string} :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe :string]]
   [:verified {:optional true} [:maybe :boolean]]
   [:queryable_dimensions {:optional true} [:maybe [:sequential ::field]]]
   [:segments {:optional true} [:maybe [:sequential ::segment]]]])

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  []
  {:message "pong"})

(api.macros/defendpoint :get "/v1/tables/:id" :- ::table-response
  "Get details for a table by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-fields with-field-values with-related-tables with-metrics with-measures with-segments]
    :or   {with-fields true, with-field-values true, with-related-tables true,
           with-metrics true, with-measures false, with-segments false}}
   :- [:map
       [:with-field-values   {:optional true} [:maybe :boolean]]
       [:with-fields         {:optional true} [:maybe :boolean]]
       [:with-related-tables {:optional true} [:maybe :boolean]]
       [:with-metrics        {:optional true} [:maybe :boolean]]
       [:with-measures       {:optional true} [:maybe :boolean]]
       [:with-segments       {:optional true} [:maybe :boolean]]]]
  (let [result (entity-details/get-table-details
                {:table-id             id
                 :with-fields?         with-fields
                 :with-field-values?   with-field-values
                 :with-related-tables? with-related-tables
                 :with-metrics?        with-metrics
                 :with-measures?       with-measures
                 :with-segments?       with-segments})]
    (if-let [data (:structured-output result)]
      data
      {:status 404, :body {:error (or (:output result) "Table not found")}})))

(api.macros/defendpoint :get "/v1/metrics/:id" :- ::full-metric-response
  "Get details for a metric by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-default-temporal-breakout with-field-values with-queryable-dimensions with-segments]
    :or   {with-default-temporal-breakout true, with-field-values true,
           with-queryable-dimensions true, with-segments false}}
   :- [:map
       [:with-default-temporal-breakout {:optional true} [:maybe :boolean]]
       [:with-field-values              {:optional true} [:maybe :boolean]]
       [:with-queryable-dimensions      {:optional true} [:maybe :boolean]]
       [:with-segments                  {:optional true} [:maybe :boolean]]]]
  (let [result (entity-details/get-metric-details
                {:metric-id                       id
                 :with-default-temporal-breakout? with-default-temporal-breakout
                 :with-field-values?              with-field-values
                 :with-queryable-dimensions?      with-queryable-dimensions
                 :with-segments?                  with-segments})]
    (if-let [data (:structured-output result)]
      data
      {:status 404, :body {:error (or (:output result) "Metric not found")}})))

;;; ------------------------------------------------- Authentication -------------------------------------------------
;;
;; The Agent API supports two authentication modes:
;;
;; 1. **Session-based**: Client exchanges JWT at `/auth/sso` endpoint to get a session token,
;;    then passes it via `X-Metabase-Session` header. The standard Metabase session middleware
;;    handles validation and expiration checking automatically.
;;
;; 2. **Stateless JWT**: Client passes a JWT via `Authorization: Bearer <jwt>` header.
;;    The JWT is validated using the configured shared secret and max-age settings.
;;    Good for simple integrations and one-off API calls.

(defn- extract-bearer-token
  "Extract the token from a Bearer authorization header."
  [auth-header]
  (when (and auth-header (str/starts-with? (u/lower-case-en auth-header) "bearer "))
    (str/trim (subs auth-header 7))))

(defn- error-response
  "Create a 401 error response with structured JSON body."
  [error-type message]
  {:status  401
   :headers {"Content-Type" "application/json"}
   :body    {:error   error-type
             :message message}})

;;; -------------------------------------------- Stateless JWT Authentication --------------------------------------------

(defn- authenticate-with-jwt
  "Authenticate a request using a stateless JWT. Returns {:user <user>} on success,
   or {:error <type> :message <msg>} on failure. Does NOT create a session.

   Uses auth-identity/authenticate to validate the JWT, which reuses the same
   implementation as the /auth/sso endpoint and handles all settings validation."
  [token]
  (let [result (auth-identity/authenticate :provider/jwt {:token token})]
    (if (:success? result)
      ;; JWT is valid - look up user from the email extracted by the JWT provider
      ;; The provider uses jwt-attribute-email setting to extract the email from claims
      (if-let [user (when-let [email (get-in result [:user-data :email])]
                      (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))]
        {:user user}
        ;; Don't reveal whether the user exists or not - use same error as invalid JWT
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."})
      ;; Authentication failed - map error to agent API format
      (case (:error result)
        :jwt-not-enabled {:error   "jwt_not_configured"
                          :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
        ;; Default: use generic invalid JWT message (don't leak details)
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."}))))

;;; -------------------------------------------------- Middleware ----------------------------------------------------

(defn- enforce-authentication
  "Middleware that ensures requests are authenticated.

   Supports two authentication modes:
   - **Session-based**: Uses `X-Metabase-Session` header, validated by standard Metabase
     session middleware (which runs before this). If `:metabase-user-id` is set on the
     request, the user is already authenticated.
   - **Stateless JWT**: Uses `Authorization: Bearer <jwt>` header. The JWT is validated
     using the same auth-identity system as the /auth/sso endpoint."
  [handler]
  (fn [{:keys [headers metabase-user-id] :as request} respond raise]
    (cond
      ;; Already authenticated via X-Metabase-Session (standard middleware handled it)
      metabase-user-id
      (handler request respond raise)

      ;; Not authenticated via session - check for Bearer JWT
      :else
      (let [auth-header  (get headers "authorization")
            bearer-token (extract-bearer-token auth-header)]
        (cond
          ;; No authorization header and no session
          (nil? auth-header)
          (respond (error-response "missing_authorization"
                                   "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."))

          ;; Authorization header present but not Bearer format
          (nil? bearer-token)
          (respond (error-response "invalid_authorization_format"
                                   "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"))

          ;; Validate JWT
          :else
          (let [result (authenticate-with-jwt bearer-token)]
            (if-let [user (:user result)]
              (request/with-current-user (:id user)
                (handler request respond raise))
              (respond (error-response (:error result) (:message result))))))))))

(def ^:private +auth
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  (api.macros/ns-handler *ns* +auth))
