(ns metabase-enterprise.metabot-v3.tools.api
  "Code for handling tool requests from the AI service."
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clj-time.core :as time]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.envelope :as envelope]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-metric :as metabot-v3.tools.find-metric]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defsetting site-uuid-for-metabot-tools
  "UUID that we use for encrypting JWT tokens given to the AI service to make callbacks with."
  :encryption :when-encryption-key-set
  :visibility :internal
  :sensitive? true
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :base       setting/uuid-nonce-base)

(defsetting metabot-ai-service-token-ttl
  (deferred-tru "The number of seconds the tokens passed to AI service should be valid.")
  :type       :integer
  :visibility :settings-manager
  :default    180
  :feature    :metabot-v3
  :doc        false
  :export?    true
  :audit      :never)

(defn- get-ai-service-token
  [user-id]
  (let [secret (buddy-hash/sha256 (site-uuid-for-metabot-tools))
        claims {:user user-id, :exp (time/plus (time/now) (time/seconds (metabot-ai-service-token-ttl)))}]
    (jwt/encrypt claims secret {:alg :dir, :enc :a128cbc-hs256})))

(defn- decode-ai-service-token
  [token]
  (try
    (when (string? token)
      (-> token
          (jwt/decrypt (buddy-hash/sha256 (site-uuid-for-metabot-tools)))
          :user))
    (catch Exception e
      (log/error e "Bad AI service token")
      nil)))

(defn handle-envelope
  "Executes the AI loop in the context of a new session. Returns the response of the AI service."
  [e]
  (let [session-id (get-ai-service-token api/*current-user-id*)]
    (try
      (metabot-v3.client/request (assoc e :session-id session-id))
      (catch Exception ex
        (let [d (ex-data ex)]
          (if-let [assistant-message (:assistant-message d)]
            (envelope/add-message (or (:envelope d) e)
                                  {:role :assistant
                                   :content assistant-message})
            (throw ex)))))))

(mr/def ::existence-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "is-null"         "is-not-null"
                "string-is-empty" "string-is-not-empty"
                "is-true"         "is-false"]]])

(mr/def ::temporal-extraction-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "year-equals"        "year-not-equals"
                "quarter-equals"     "quarter-not-equals"
                "month-equals"       "month-not-equals"
                "day-of-week-equals" "day-of-week-not-equals"
                "hour-equals"        "hour-not-equals"
                "minute-equals"      "minute-not-equals"
                "second-equals"      "second-not-equals"]]
   [:value :int]])

(mr/def ::disjunctive-temporal-extraction-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "year-equals"        "year-not-equals"
                "quarter-equals"     "quarter-not-equals"
                "month-equals"       "month-not-equals"
                "day-of-week-equals" "day-of-week-not-equals"
                "hour-equals"        "hour-not-equals"
                "minute-equals"      "minute-not-equals"
                "second-equals"      "second-not-equals"]]
   [:values [:sequential :int]]])

(mr/def ::temporal-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "equals"       "not-equals"
                "greater-than" "greater-than-or-equal"
                "less-than"    "less-than-or-equal"
                "date-equals"  "date-not-equals"
                "date-before"  "date-on-or-before"
                "date-after"   "date-on-or-after"]]
   [:value :string]])

(mr/def ::string-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "equals"             "not-equals"
                "string-equals"      "string-not-equals"
                "string-contains"    "string-not-contains"
                "string-starts-with" "string-ends-with"]]
   [:value :string]])

(mr/def ::disjunctive-string-date-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "equals"             "not-equals"
                "date-equals"        "date-not-equals"
                "string-equals"      "string-not-equals"
                "string-contains"    "string-not-contains"
                "string-starts-with" "string-ends-with"]]
   [:values [:sequential :string]]])

(mr/def ::numeric-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "equals"              "not-equals"
                "greater-than"        "greater-than-or-equal"
                "less-than"           "less-than-or-equal"
                "number-equals"       "number-not-equals"
                "number-greater-than" "number-greater-than-or-equal"
                "number-less-than"    "number-less-than-or-equal"]]
   [:value [:or :int :double]]])

(mr/def ::disjunctive-numeric-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "equals"        "not-equals"
                "number-equals" "number-not-equals"]]
   [:values [:sequential [:or :int :double]]]])

(mr/def ::filter
  [:or
   ::existence-filter
   ::temporal-extraction-filter ::disjunctive-temporal-extraction-filter
   ::temporal-filter
   ::string-filter ::disjunctive-string-date-filter
   ::numeric-filter ::disjunctive-numeric-filter])

(mr/def ::group-by
  [:map
   [:field_id :string]
   [:field_granularity {:optional true} [:maybe [:enum "day" "week" "month" "quarter" "year"]]]])

(mr/def ::query-metric-arguments
  [:map
   {:encode/tool-api-request #(#_metabot-v3.u/recursive-update-keys update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:metric_id :int]
   [:filters {:optional true} [:maybe [:sequential ::filter]]]
   [:group_by {:optional true} [:maybe [:sequential ::group-by]]]])

(mr/def ::result-column
  [:map
   [:field_id :string]
   [:name :string]
   [:type :string]
   [:description {:optional true} :string]])

(mr/def ::filtering-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output
     [:map
      [:type [:= :query]]
      [:query_id :string]
      [:query mbql.s/Query]
      [:result_columns [:sequential ::result-column]]]]]
   [:map
    [:output :string]]])

(mr/def ::tool-request [:map [:conversation_id ms/UUIDString]])

(mr/def ::subscription-schedule
  (let [days ["sunday" "monday" "tuesday" "wednesday" "thursday" "friday" "saturday"]]
    [:or
     [:map
      [:frequency [:= "hourly"]]]
     [:map
      [:frequency [:= "daily"]]
      [:hour :int]]
     [:map
      [:frequency [:= "weekly"]]
      [:hour :int]
      [:day_of_week (into [:enum] days)]]
     [:map
      [:frequency [:= "monthly"]]
      [:hour :int]
      [:day_of_month (into [:enum "first-calendar-day" "middle-of-month" "last-calendar-day"]
                           (for [fl ["first" "last"]
                                 day days]
                             (str fl "-" day)))]]]))

(mr/def ::create-dashboard-subscription-arguments
  [:map
   {:encode/tool-api-request #(#_metabot-v3.u/recursive-update-keys update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:dashboard_id :int]
   [:email :string]
   [:schedule ::subscription-schedule]])

(mr/def ::filter-records-arguments
  [:map
   {:encode/tool-api-request #(#_metabot-v3.u/recursive-update-keys update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:data_source [:or
                  [:map
                   [:query [:map
                            [:database :int]]]
                   [:query_id {:optional true} :string]]
                  [:map [:report_id :int]]
                  [:map [:table_id :string]]]]
   [:filters [:sequential ::filter]]])

(mr/def ::find-metric-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:id :int]
                         [:name :string]
                         [:description [:maybe :string]]
                         [:default_time_dimension_field_id [:maybe ::result-column]]
                         [:queryable_dimensions [:sequential ::result-column]]]]]
   [:map [:output :string]]])

(mr/def ::find-outliers-arguments
  [:map
   {:encode/tool-api-request #(#_metabot-v3.u/recursive-update-keys update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:data_source [:or
                  [:map
                   [:query [:map
                            [:database :int]]]
                   [:query_id {:optional true} :string]
                   [:result_field_id :string]]
                  [:map
                   [:metric_id :int]]
                  [:map
                   [:report_id :int]
                   [:result_field_id :string]]
                  [:map
                   [:table_id :string]
                   [:result_field_id :string]]]]])

(mr/def ::find-outliers-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:sequential
                         [:map
                          [:dimension :any]
                          [:value [:or :int :double]]]]]]
   [:map [:output :string]]])

(mr/def ::generate-insights-arguments
  [:map
   {:encode/tool-api-request #(#_metabot-v3.u/recursive-update-keys update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:for [:or
          [:map [:metric_id :int]]
          [:map [:table_id :string]]
          [:map [:report_id :int]]
          [:map [:query :map]]]]])

(mr/def ::get-current-user-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:id :int]
                         [:name :string]
                         [:email_address :string]]]]
   [:map [:output :string]]])

(mr/def ::get-dashboard-details-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:id :int]
                         [:name :string]
                         [:description {:optional true} :string]]]]
   [:map [:output :string]]])

(mr/def ::field-type
  [:enum "boolean" "date" "number" "string"])

(mr/def ::column
  [:map
   [:field_id :string]
   [:name :string]
   [:type [:maybe ::field-type]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::basic-metric
  [:map
   [:id :int]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe :string]]])

(mr/def ::columns
  [:sequential ::column])

(mr/def ::get-metric-details-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:merge ::basic-metric [:map [:queryable_dimensions ::columns]]]]]
   [:map [:output :string]]])

(mr/def ::get-query-details-result
  [:or
   [:map
    {:decode/tool-api-response
     (fn [result]
       (let [query (:query ((some-fn :structured-output :structured_output) result))]
         (-> result
             (m/dissoc-in [:structured-output :query] [:structured_output :query])
             (metabot-v3.u/recursive-update-keys metabot-v3.u/safe->snake_case_en)
             (assoc-in [:structured_output :query] query))))}
    [:structured_output [:map
                         [:type [:= :query]]
                         [:query_id :string]
                         [:query :map]
                         [:result_columns ::columns]]]]
   [:map [:output :string]]])

(mr/def ::get-report-details-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:id :int]
                         [:name :string]
                         [:description {:optional true} [:maybe :string]]
                         [:result_columns ::columns]]]]
   [:map [:output :string]]])

(mr/def ::get-table-details-arguments
  [:and
   [:map
    {:encode/tool-api-request #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->kebab-case-en)}
    [:model_id {:optional true} :int]
    [:table_id {:optional true} [:or :int :string]]]
   [:fn {:error/message "Exactly one of model_id and table_id required"}
    #(= (count (select-keys % [:model_id :table_id])) 1)]])

(mr/def ::basic-table
  [:map
   [:id :int]
   [:name :string]
   [:fields ::columns]
   [:description {:optional true} [:maybe :string]]
   [:metrics {:optional true} [:sequential ::basic-metric]]])

(mr/def ::get-table-details-result
  [:or
   [:map
    {:decode/tool-api-response #(metabot-v3.u/recursive-update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:merge
                         ::basic-table
                         [:map [:queryable_foreign_key_tables {:optional true} [:sequential ::basic-table]]]]]]
   [:map [:output :string]]])

(api.macros/defendpoint :post "/create-dashboard-subscription" :- [:merge
                                                                   [:map [:output :string]]
                                                                   ::tool-request]
  "Create a dashboard subscription."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::create-dashboard-subscription-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :create-dashboard-subscription) :llm.log/llm->be)
  (let [arguments (mc/encode ::create-dashboard-subscription-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription arguments)
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/filter-records" :- [:merge ::filtering-result ::tool-request]
  "Construct a query from a metric."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::filter-records-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :filter-records) :llm.log/llm->be)
  (let [arguments (mc/encode ::filter-records-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::filtering-result
                         (metabot-v3.tools.filters/filter-records arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/find-metric" :- [:merge ::find-metric-result ::tool-request]
  "Find a metric matching a description."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments [:map [:message :string]]]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :find-metric) :llm.log/llm->be)
  (doto (-> (mc/decode ::find-metric-result
                       (metabot-v3.tools.find-metric/find-metric arguments)
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/find-outliers" :- [:merge ::find-outliers-result ::tool-request]
  "Find outliers in the values provided by a data source for a given column."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::find-outliers-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :find-outliers) :llm.log/llm->be)
  (let [arguments (mc/encode ::find-outliers-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::find-outliers-result
                         (metabot-v3.tools.find-outliers/find-outliers arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/generate-insights" :- [:merge
                                                       [:map
                                                        [:output :string]
                                                        [:reactions [:sequential :metabot.reaction/redirect]]]
                                                       ::tool-request]
  "Generate insights."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::generate-insights-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :generate-insights) :llm.log/llm->be)
  (let [arguments (mc/encode ::generate-insights-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (metabot-v3.tools.generate-insights/generate-insights arguments)
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/get-current-user" :- [:merge ::get-current-user-result ::tool-request]
  "Get information about user that started the conversation."
  [_route-params
   _query-params
   {:keys [conversation_id] :as body} :- ::tool-request]
  (metabot-v3.context/log (assoc body :api :get-current-user) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-current-user-result
                       (metabot-v3.dummy-tools/get-current-user)
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-dashboard-details" :- [:merge ::get-dashboard-details-result ::tool-request]
  "Get information about a given dashboard."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments [:map [:dashboard_id :int]]]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-dashboard-details) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-dashboard-details-result
                       (metabot-v3.dummy-tools/get-dashboard-details
                        (metabot-v3.u/recursive-update-keys arguments metabot-v3.u/safe->kebab-case-en))
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-metric-details" :- [:merge ::get-metric-details-result ::tool-request]
  "Get information about a given metric."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments [:map [:metric_id :int]]]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-metric-details) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-metric-details-result
                       (metabot-v3.dummy-tools/get-metric-details
                        (metabot-v3.u/recursive-update-keys arguments metabot-v3.u/safe->kebab-case-en))
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-query-details" :- [:merge ::get-query-details-result ::tool-request]
  "Get information about a given query."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments [:map [:query :map]]]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-query-details) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-query-details-result
                       (metabot-v3.dummy-tools/get-query-details arguments)
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-report-details" :- [:merge ::get-report-details-result ::tool-request]
  "Get information about a given report."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments [:map [:report_id :int]]]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-report-details) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-report-details-result
                       (metabot-v3.dummy-tools/get-report-details
                        (metabot-v3.u/recursive-update-keys arguments metabot-v3.u/safe->kebab-case-en))
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-table-details" :- [:merge ::get-table-details-result ::tool-request]
  "Get information about a given table or model."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments  ::get-table-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-table-details) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-table-details-result
                       (metabot-v3.dummy-tools/get-table-details
                        (metabot-v3.u/recursive-update-keys arguments metabot-v3.u/safe->kebab-case-en))
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/query-metric" :- [:merge ::filtering-result ::tool-request]
  "Construct a query from a metric."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::query-metric-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :query-metric) :llm.log/llm->be)
  (let [arguments (mc/encode ::query-metric-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::filtering-result
                         (metabot-v3.tools.filters/query-metric arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(defn- enforce-authentication
  "Middleware that returns a 401 response if no `ai-session` can be found for  `request`."
  [handler]
  (with-meta
   (fn [{:keys [headers] :as request} respond raise]
     (if-let [user-id (decode-ai-service-token (get headers "x-metabase-session"))]
       (request/with-current-user user-id
         (handler request respond raise))
       (if (:metabase-user-id request)
         (handler request respond raise)
         (respond request/response-unauthentic))))
   (meta handler)))

(def ^{:arglists '([handler])} +tool-session
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-tools` routes."
  (api.macros/ns-handler *ns* +tool-session))
