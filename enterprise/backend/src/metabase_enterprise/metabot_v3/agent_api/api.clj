(ns metabase-enterprise.metabot-v3.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.settings :as metabot-settings]
   [metabase-enterprise.metabot-v3.tools.api :as tools.api]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details]
   [metabase-enterprise.metabot-v3.tools.field-stats :as field-stats]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-filters]
   [metabase-enterprise.metabot-v3.tools.search :as metabot-search]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.lib.core :as lib]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.json :as json]
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

(mr/def ::statistics
  [:map {:encode/api ->snake_case-keys}
   [:distinct_count {:optional true} [:maybe :int]]
   [:percent_null   {:optional true} [:maybe number?]]
   [:min            {:optional true} [:maybe number?]]
   [:max            {:optional true} [:maybe number?]]
   [:avg            {:optional true} [:maybe number?]]
   [:q1             {:optional true} [:maybe number?]]
   [:q3             {:optional true} [:maybe number?]]
   [:sd             {:optional true} [:maybe number?]]
   [:percent_json   {:optional true} [:maybe number?]]
   [:percent_url    {:optional true} [:maybe number?]]
   [:percent_email  {:optional true} [:maybe number?]]
   [:percent_state  {:optional true} [:maybe number?]]
   [:average_length {:optional true} [:maybe number?]]
   [:earliest       {:optional true} [:maybe :string]]
   [:latest         {:optional true} [:maybe :string]]])

(mr/def ::field-values-response
  [:map {:encode/api ->snake_case-keys}
   [:field_id {:optional true} [:maybe :string]]
   [:statistics {:optional true} [:maybe ::statistics]]
   [:values {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::search-result-item
  "Schema for search result items (tables and metrics only, no collection info)."
  [:map {:encode/api ->snake_case-keys}
   [:id :int]
   [:type [:enum "table" "metric"]]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_schema {:optional true} [:maybe :string]]
   [:verified {:optional true} [:maybe :boolean]]
   [:updated_at {:optional true} [:maybe :any]]
   [:created_at {:optional true} [:maybe :any]]])

(mr/def ::search-response
  [:map {:encode/api ->snake_case-keys}
   [:data [:sequential ::search-result-item]]
   [:total_count :int]])

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  []
  {:message "pong"})

(api.macros/defendpoint :get "/v1/table/:id" :- ::table-response
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

(api.macros/defendpoint :get "/v1/table/:id/field/:field-id/values" :- ::field-values-response
  "Get statistics and sample values for a table field."
  [{:keys [id field-id]} :- [:map
                             [:id       ms/PositiveInt]
                             [:field-id ms/NonBlankString]]]
  (let [result (field-stats/field-values
                {:entity-type "table"
                 :entity-id   id
                 :field-id    field-id
                 :limit       (request/limit)})]
    (if-let [data (:structured-output result)]
      data
      {:status 404, :body {:error (or (:output result) "Field not found")}})))

(api.macros/defendpoint :get "/v1/metric/:id" :- ::full-metric-response
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

(api.macros/defendpoint :get "/v1/metric/:id/field/:field-id/values" :- ::field-values-response
  "Get statistics and sample values for a metric field."
  [{:keys [id field-id]} :- [:map
                             [:id       ms/PositiveInt]
                             [:field-id ms/NonBlankString]]]
  (let [result (field-stats/field-values
                {:entity-type "metric"
                 :entity-id   id
                 :field-id    field-id
                 :limit       (request/limit)})]
    (if-let [data (:structured-output result)]
      data
      {:status 404, :body {:error (or (:output result) "Field not found")}})))

(api.macros/defendpoint :post "/v1/search" :- ::search-response
  "Search for tables and metrics.

  Supports both term-based and semantic search queries. Results are ranked using
  Reciprocal Rank Fusion when both query types are provided."
  [_route-params
   _query-params
   {term-queries     :term_queries
    semantic-queries :semantic_queries}
   :- [:map
       [:term_queries     {:optional true} [:maybe [:sequential ms/NonBlankString]]]
       [:semantic_queries {:optional true} [:maybe [:sequential ms/NonBlankString]]]]]
  (let [results (metabot-search/search
                 {:term-queries     (or term-queries [])
                  :semantic-queries (or semantic-queries [])
                  :entity-types     ["table" "metric"]
                  :limit            (or (request/limit) 50)})]
    {:data        results
     :total_count (count results)}))

;;; ------------------------------------------------ Construct Query -------------------------------------------------

;; Reuse schemas from the metabot tools API for query components
(mr/def ::construct-query-table-request
  "Request schema for constructing a query from a table.
   Supports all query components: filters, fields, aggregations, group_by, order_by, limit."
  [:map
   [:table_id ms/PositiveInt]
   [:filters      {:optional true} [:maybe [:sequential ::tools.api/filter]]]
   [:fields       {:optional true} [:maybe [:sequential ::tools.api/field]]]
   [:aggregations {:optional true} [:maybe [:sequential ::tools.api/aggregation]]]
   [:group_by     {:optional true} [:maybe [:sequential ::tools.api/group-by]]]
   [:order_by     {:optional true} [:maybe [:sequential [:map
                                                         [:field ::tools.api/field]
                                                         [:direction [:enum "asc" "desc"]]]]]]
   [:limit        {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::construct-query-metric-request
  "Request schema for constructing a query from a metric.
   Only supports filters and group_by (aggregation is defined by the metric)."
  [:map
   [:metric_id ms/PositiveInt]
   [:filters  {:optional true} [:maybe [:sequential ::tools.api/filter]]]
   [:group_by {:optional true} [:maybe [:sequential ::tools.api/group-by]]]])

(mr/def ::construct-query-request
  "Request schema for /v1/construct-query. Accepts either table_id or metric_id."
  [:or ::construct-query-table-request ::construct-query-metric-request])

(mr/def ::construct-query-response
  [:map
   [:query :string]])

(defn- encode-base64-url-safe
  "Encode a string to URL-safe base64 (RFC 4648).
   Replaces + with - and / with _ to match frontend encoding."
  [^String s]
  (-> s
      u/encode-base64
      (str/replace "+" "-")
      (str/replace "/" "_")))

(defn- construct-table-query
  "Build a query from a table using the provided query components."
  [{:keys [table_id filters fields aggregations group_by order_by limit]}]
  (let [result (metabot-filters/query-datasource
                {:table-id     table_id
                 :filters      filters
                 :fields       fields
                 :aggregations aggregations
                 :group-by     group_by
                 :order-by     (mapv (fn [{:keys [field direction]}]
                                       {:field field :direction (keyword direction)})
                                     order_by)
                 :limit        limit})]
    (if-let [data (:structured-output result)]
      {:query (-> (:query data)
                  lib/->legacy-MBQL
                  json/encode
                  encode-base64-url-safe)}
      {:status 400, :body {:error (or (:output result) "Failed to construct query")}})))

(defn- construct-metric-query
  "Build a query from a metric using filters and group_by."
  [{:keys [metric_id filters group_by]}]
  (let [result (metabot-filters/query-metric
                {:metric-id metric_id
                 :filters   filters
                 :group-by  group_by})]
    (if-let [data (:structured-output result)]
      {:query (-> (:query data)
                  lib/->legacy-MBQL
                  json/encode
                  encode-base64-url-safe)}
      {:status 404, :body {:error (or (:output result) "Metric not found")}})))

(api.macros/defendpoint :post "/v1/construct-query" :- ::construct-query-response
  "Construct an MBQL query from a table or metric.

  Returns a base64-encoded MBQL query that can be used with the query API.

  For tables, supports: filters, fields, aggregations, group_by, order_by, limit.
  For metrics, supports: filters, group_by (aggregation is defined by the metric)."
  [_route-params
   _query-params
   body :- ::construct-query-request]
  (if (:table_id body)
    (construct-table-query body)
    (construct-metric-query body)))

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
