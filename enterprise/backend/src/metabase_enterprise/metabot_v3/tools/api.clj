(ns metabase-enterprise.metabot-v3.tools.api
  "Code for handling tool requests from the AI service."
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clj-time.core :as time]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.envelope :as envelope]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
    :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.field-stats :as metabot-v3.tools.field-stats]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-metric :as metabot-v3.tools.find-metric]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn- get-ai-service-token
  [user-id metabot-id]
  (let [secret (buddy-hash/sha256 (metabot-v3.settings/site-uuid-for-metabot-tools))
        claims {:user user-id
                :exp (time/plus (time/now) (time/seconds (metabot-v3.settings/metabot-ai-service-token-ttl)))
                :metabot-id metabot-id}]
    (jwt/encrypt claims secret {:alg :dir, :enc :a128cbc-hs256})))

(defn- decode-ai-service-token
  [token]
  (try
    (when (string? token)
      (jwt/decrypt token (buddy-hash/sha256 (metabot-v3.settings/site-uuid-for-metabot-tools))))
    (catch Exception e
      (log/error e "Bad AI service token")
      nil)))

(defn handle-envelope
  "Executes the AI loop in the context of a new session. Returns the response of the AI service."
  [{:keys [metabot-id] :as e}]
  (let [session-id (get-ai-service-token api/*current-user-id* metabot-id)]
    (try
      (metabot-v3.client/request (assoc e :session-id session-id))
      (catch Exception ex
        (let [d (ex-data ex)]
          (if-let [assistant-message (:assistant-message d)]
            (envelope/add-message (or (:envelope d) e)
                                  {:role :assistant
                                   :content assistant-message})
            (throw ex)))))))

(mr/def ::bucket
  (into [:enum {:error/message "Valid bucket"
                :encode/tool-api-request keyword}]
        (map name)
        lib.schema.temporal-bucketing/ordered-datetime-bucketing-units))

(mr/def ::existence-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "is-null"         "is-not-null"
                 "string-is-empty" "string-is-not-empty"
                 "is-true"         "is-false"]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::temporal-extraction-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "year-equals"        "year-not-equals"
                 "quarter-equals"     "quarter-not-equals"
                 "month-equals"       "month-not-equals"
                 "day-of-week-equals" "day-of-week-not-equals"
                 "hour-equals"        "hour-not-equals"
                 "minute-equals"      "minute-not-equals"
                 "second-equals"      "second-not-equals"]]
    [:value :int]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-temporal-extraction-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "year-equals"        "year-not-equals"
                 "quarter-equals"     "quarter-not-equals"
                 "month-equals"       "month-not-equals"
                 "day-of-week-equals" "day-of-week-not-equals"
                 "hour-equals"        "hour-not-equals"
                 "minute-equals"      "minute-not-equals"
                 "second-equals"      "second-not-equals"]]
    [:values [:sequential :int]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::temporal-filter
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"       "not-equals"
                 "greater-than" "greater-than-or-equal"
                 "less-than"    "less-than-or-equal"
                 "date-equals"  "date-not-equals"
                 "date-before"  "date-on-or-before"
                 "date-after"   "date-on-or-after"]]
    [:value [:or :string :int]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-temporal-filter
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"       "not-equals"
                 "greater-than" "greater-than-or-equal"
                 "less-than"    "less-than-or-equal"]]
    [:values [:sequential [:or :string :int]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::string-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"             "not-equals"
                 "string-equals"      "string-not-equals"
                 "string-contains"    "string-not-contains"
                 "string-starts-with" "string-ends-with"]]
    [:value :string]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-string-date-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"             "not-equals"
                 "string-contains"    "string-not-contains"
                 "string-starts-with" "string-ends-with"]]
    [:values [:sequential :string]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::numeric-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"              "not-equals"
                 "greater-than"        "greater-than-or-equal"
                 "less-than"           "less-than-or-equal"
                 "number-equals"       "number-not-equals"
                 "number-greater-than" "number-greater-than-or-equal"
                 "number-less-than"    "number-less-than-or-equal"]]
    [:value [:or :int :double]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-numeric-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"        "not-equals"
                 "number-equals" "number-not-equals"]]
    [:values [:sequential [:or :int :double]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::filter
  [:or
   ::existence-filter
   ::temporal-extraction-filter ::disjunctive-temporal-extraction-filter
   ::temporal-filter ::disjunctive-temporal-filter
   ::string-filter ::disjunctive-string-date-filter
   ::numeric-filter ::disjunctive-numeric-filter])

(mr/def ::group-by
  [:and
   [:map
    [:field_id :string]
    [:field_granularity {:optional true}
     [:maybe [:enum {:encode/tool-api-request keyword}
              "day" "week" "month" "quarter" "year"]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::query-metric-arguments
  [:and
   [:map
    [:metric_id :int]
    [:filters {:optional true} [:maybe [:sequential ::filter]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::aggregation
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]
    [:sort_order {:optional true} [:maybe [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]
    [:function [:enum {:encode/tool-api-request keyword}
                "avg" "count" "count-distinct" "max" "min" "sum"]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::field
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::query-model-arguments
  [:and
   [:map
    [:model_id :int]
    [:fields {:optional true} [:maybe [:sequential ::field]]]
    [:filters {:optional true} [:maybe [:sequential ::filter]]]
    [:aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]
    [:order_by {:optional true} [:maybe [:sequential [:map
                                                      [:field ::field]
                                                      [:direction [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]]]]
    [:limit {:optional true} [:maybe :int]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::count
  [:and
   :int
   [:fn
    {:error/message "Valid count, a natural number"}
    #(<= 0 %)]])

(mr/def ::proportion
  [:and
   number?
   [:fn
    {:error/message "Valid proportion between (inclusive) 0 and 1."}
    #(<= 0 % 1)]])

(mr/def ::field-values
  [:or
   [:sequential :boolean]
   [:sequential number?]
   [:sequential :string]])

(mr/def ::statistics
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:distinct_count {:optional true} [:maybe ::count]]
   [:percent_null   {:optional true} [:maybe ::proportion]]
   [:min            {:optional true} [:maybe number?]]
   [:max            {:optional true} [:maybe number?]]
   [:avg            {:optional true} [:maybe number?]]
   [:q1             {:optional true} [:maybe number?]]
   [:q3             {:optional true} [:maybe number?]]
   [:sd             {:optional true} [:maybe number?]]
   [:percent_json   {:optional true} [:maybe ::proportion]]
   [:percent_url    {:optional true} [:maybe ::proportion]]
   [:percent_email  {:optional true} [:maybe ::proportion]]
   [:percent_state  {:optional true} [:maybe ::proportion]]
   [:average_length {:optional true} [:maybe number?]]
   [:earliest       {:optional true} [:maybe :string]]
   [:latest         {:optional true} [:maybe :string]]
   [:values         {:optional true} [:maybe ::field-values]]])

(mr/def ::field-values-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output
     [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
      [:field_id :string]
      [:statistics {:optional true} [:maybe ::statistics]]
      [:values {:optional true} [:maybe [:sequential :any]]]]]]
   [:map
    [:output :string]]])

(mr/def ::field-type
  [:enum {:decode/tool-api-response #(when % (-> % name u/->snake_case_en))}
   "boolean" "date" "datetime" "time" "number" "string"])

(mr/def ::column
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:field_id :string]
   [:name :string]
   [:type [:maybe ::field-type]]
   [:description {:optional true} [:maybe :string]]
   [:semantic_type {:optional true
                    :decode/tool-api-response #(some-> % name u/->snake_case_en)}
    [:maybe :string]]
   [:field_values {:optional true} ::field-values]])

(mr/def ::columns
  [:sequential ::column])

(mr/def ::filtering-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output
     [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
      [:type [:= :query]]
      [:query_id :string]
      [:query mbql.s/Query]
      [:result_columns [:sequential ::column]]]]]
   [:map
    [:output :string]]])

(mr/def ::tool-request [:map [:conversation_id ms/UUIDString]])

(mr/def ::subscription-schedule
  (let [days ["sunday" "monday" "tuesday" "wednesday" "thursday" "friday" "saturday"]]
    [:and
     [:or
      [:map
       [:frequency [:= {:encode/tool-api-request keyword} "hourly"]]]
      [:map
       [:frequency [:= {:encode/tool-api-request keyword} "daily"]]
       [:hour :int]]
      [:map
       [:frequency [:= {:encode/tool-api-request keyword} "weekly"]]
       [:hour :int]
       [:day_of_week (into [:enum {:encode/tool-api-request keyword}] days)]]
      [:map
       [:frequency [:= {:encode/tool-api-request keyword} "monthly"]]
       [:hour :int]
       [:day_of_month (into [:enum {:encode/tool-api-request keyword}
                             "first-calendar-day" "middle-of-month" "last-calendar-day"]
                            (for [fl ["first" "last"]
                                  day days]
                              (str fl "-" day)))]]]
     [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]]))

(mr/def ::create-dashboard-subscription-arguments
  [:and
   [:map
    [:dashboard_id :int]
    [:email :string]
    [:schedule ::subscription-schedule]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::field-values-arguments
  [:and
   [:map
    [:entity_type [:enum "table" "model" "metric"]]
    [:entity_id :int]
    [:field_id :string]
    [:limit {:optional true} [:maybe :int]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::filter-records-arguments
  [:and
   [:map
    [:data_source [:and
                   [:or
                    [:map
                     [:query [:map [:database :int]]]
                     [:query_id {:optional true} :string]]
                    [:map [:report_id :int]]
                    [:map [:table_id :string]]]
                   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]]]
    [:filters [:sequential ::filter]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::basic-metric
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe :string]]])

(mr/def ::full-metric
  [:merge
   ::basic-metric
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:queryable_dimensions ::columns]]])

(mr/def ::find-metric-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:id :int]
                         [:type [:= :metric]]
                         [:name :string]
                         [:description [:maybe :string]]
                         [:default_time_dimension_field_id [:maybe ::column]]
                         [:queryable_dimensions [:sequential ::column]]]]]
   [:map [:output :string]]])

(mr/def ::find-outliers-arguments
  [:and
   [:map
    [:data_source [:and
                   [:or
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
                     [:result_field_id :string]]]
                   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::find-outliers-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:sequential
                         [:map
                          [:dimension :any]
                          [:value [:or :int :double]]]]]]
   [:map [:output :string]]])

(mr/def ::generate-insights-arguments
  [:map
   ;; query should not be changed to kebab-case
   {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:for [:or
          [:map [:metric_id :int]]
          [:map [:table_id :string]]
          [:map [:report_id :int]]
          [:map [:query :map]]]]])

(mr/def ::get-current-user-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:id :int]
                         [:type [:= :user]]
                         [:name :string]
                         [:email_address :string]]]]
   [:map [:output :string]]])

(mr/def ::get-dashboard-details-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:id :int]
                         [:type [:= :dashboard]]
                         [:name :string]
                         [:description {:optional true} :string]]]]
   [:map [:output :string]]])

(mr/def ::get-metric-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output ::full-metric]]
   [:map [:output :string]]])

(mr/def ::get-query-details-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:type [:= :query]]
                         [:query_id :string]
                         [:query :map]
                         [:result_columns ::columns]]]]
   [:map [:output :string]]])

(mr/def ::get-report-details-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:id :int]
                         [:type [:= :question]]
                         [:name :string]
                         [:description {:optional true} [:maybe :string]]
                         [:result_columns ::columns]]]]
   [:map [:output :string]]])

(mr/def ::get-table-details-arguments
  [:and
   [:map
    [:model_id {:optional true} :int]
    [:table_id {:optional true} [:or :int :string]]]
   [:fn {:error/message "Exactly one of model_id and table_id required"}
    #(= (count (select-keys % [:model_id :table_id])) 1)]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::basic-table
  [:map
   [:id :int]
   [:type [:enum :model :table]]
   [:name :string]
   [:fields ::columns]
   [:description {:optional true} [:maybe :string]]
   [:metrics {:optional true} [:sequential ::basic-metric]]])

(mr/def ::full-table
  [:merge
   ::basic-table
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:queryable_foreign_key_tables {:optional true} [:sequential ::basic-table]]]])

(mr/def ::get-table-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output ::full-table]]
   [:map [:output :string]]])

(mr/def ::answer-sources-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:metrics [:sequential ::full-metric]]
                         [:models  [:sequential ::full-table]]]]]
   [:map [:output :string]]])

(api.macros/defendpoint :post "/answer-sources" :- [:merge ::answer-sources-result ::tool-request]
  "Create a dashboard subscription."
  [_route-params
   _query-params
   {:keys [conversation_id] :as body} :- ::tool-request
   {:keys [metabot-v3/metabot-id]}]
  (metabot-v3.context/log (assoc body :api :answer-sources) :llm.log/llm->be)
  (if-let [collection-name (get-in metabot-v3.config/metabot-config [metabot-id :collection-name])]
    (doto (-> (mc/decode ::answer-sources-result
                         (metabot-v3.dummy-tools/answer-sources collection-name)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))
    (throw (ex-info (i18n/tru "Invalid metabot_id {0}" metabot-id)
                    {:metabot_id metabot-id, :status-code 400}))))

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

(api.macros/defendpoint :post "/field-values" :- [:merge ::field-values-result ::tool-request]
  "Return statistics and/or values for a given field of a given entity."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::field-values-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :field-values) :llm.log/llm->be)
  (let [arguments (mc/encode ::field-values-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::field-values-result
                         (metabot-v3.tools.field-stats/field-values arguments)
                         (mtx/transformer {:name :tool-api-response}))
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
                       (-> arguments
                           (update-keys metabot-v3.u/safe->kebab-case-en)
                           metabot-v3.dummy-tools/get-dashboard-details)
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
                       (-> arguments
                           (update-keys metabot-v3.u/safe->kebab-case-en)
                           metabot-v3.dummy-tools/get-metric-details)
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
                       (-> arguments
                           (update-keys metabot-v3.u/safe->kebab-case-en)
                           metabot-v3.dummy-tools/get-report-details)
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-table-details" :- [:merge ::get-table-details-result ::tool-request]
  "Get information about a given table or model."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::get-table-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-table-details) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-table-details-result
                       (metabot-v3.dummy-tools/get-table-details
                        (mc/encode ::get-table-details-arguments
                                   arguments (mtx/transformer {:name :tool-api-request})))
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

(api.macros/defendpoint :post "/query-model" :- [:merge ::filtering-result ::tool-request]
  "Construct a query from a model."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::query-model-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :query-model) :llm.log/llm->be)
  (let [arguments (mc/encode ::query-model-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::filtering-result
                         (metabot-v3.tools.filters/query-model arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(defn- enforce-authentication
  "Middleware that returns a 401 response if no `ai-session` can be found for  `request`."
  [handler]
  (fn [{:keys [headers] :as request} respond raise]
    (if-let [{:keys [user metabot-id]} (-> headers
                                           (get "x-metabase-session")
                                           decode-ai-service-token)]
      (request/with-current-user user
        (handler (assoc request :metabot-v3/metabot-id metabot-id) respond raise))
      (if (:metabase-user-id request)
        ;; request relying on metabot-id are going to fail
        (handler request respond raise)
        (respond request/response-unauthentic)))))

(def ^{:arglists '([handler])} +tool-session
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-tools` routes."
  (api.macros/ns-handler *ns* +tool-session))
