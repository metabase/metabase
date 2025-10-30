(ns metabase-enterprise.metabot-v3.tools.api
  "Code for handling tool requests from the AI service."
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clojure.set :as set]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
    :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.dependencies :as metabot-v3.tools.dependencies]
   [metabase-enterprise.metabot-v3.tools.field-stats :as metabot-v3.tools.field-stats]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase-enterprise.metabot-v3.tools.search :as metabot-v3.tools.search]
   [metabase-enterprise.metabot-v3.tools.snippets :as metabot-v3.tools.snippets]
   [metabase-enterprise.metabot-v3.tools.transforms :as metabot-v3.tools.transforms]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.macros :as api.macros]
   [metabase.api.response :as api.response]
   [metabase.api.routes.common :as api.routes.common]
   ;; TODO (Cam 10/10/25) -- update MetaBot to use Lib + MBQL 5
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- decode-ai-service-token
  [token]
  (try
    (when (string? token)
      (jwt/decrypt token (buddy-hash/sha256 (metabot-v3.settings/site-uuid-for-metabot-tools))))
    (catch Exception e
      (log/error e "Bad AI service token")
      nil)))

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

(mr/def ::query-datasource-arguments
  [:and
   [:map
    [:table_id {:optional true} :int]
    [:model_id {:optional true} :int]
    [:fields {:optional true} [:maybe [:sequential ::field]]]
    [:filters {:optional true} [:maybe [:sequential ::filter]]]
    [:aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]
    [:order_by {:optional true} [:maybe [:sequential [:map
                                                      [:field ::field]
                                                      [:direction [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]]]]
    [:limit {:optional true} [:maybe :int]]]
   [:fn {:error/message "Exactly one of table_id and model_id required"}
    #(= (count (select-keys % [:table_id :model_id])) 1)]
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
      [:query ::mbql.s/Query]
      [:result_columns [:sequential ::column]]]]]
   [:map
    [:output :string]]])

(mr/def ::tool-request [:map [:conversation_id ms/UUIDString]])

(mr/def ::answer-sources-arguments
  [:and
   [:map
    [:with_model_fields                     {:optional true, :default true} :boolean]
    [:with_model_metrics                    {:optional true, :default true} :boolean]
    [:with_metric_default_temporal_breakout {:optional true, :default true} :boolean]
    [:with_metric_queryable_dimensions      {:optional true, :default true} :boolean]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:with_model_fields                     :with-fields?
                               :with_model_metrics                    :with-metrics?
                               :with_metric_default_temporal_breakout :with-default-temporal-breakout?
                               :with_metric_queryable_dimensions      :with-queryable-dimensions?})}]])

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
    [:queryable_dimensions {:optional true} ::columns]
    [:verified {:optional true} :boolean]]])

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
                         [:description {:optional true} :string]
                         [:verified {:optional true} :boolean]]]]
   [:map [:output :string]]])

(mr/def ::get-metric-details-arguments
  [:and
   [:map
    [:metric_id                                                      :int]
    [:with_default_temporal_breakout {:optional true, :default true} :boolean]
    [:with_field_values              {:optional true, :default true} :boolean]
    [:with_queryable_dimensions      {:optional true, :default true} :boolean]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:metric_id                      :metric-id
                               :with_default_temporal_breakout :with-default-temporal-breakout?
                               :with_field_values              :with-field-values?
                               :with_queryable_dimensions      :with-queryable-dimensions?})}]])

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

(mr/def ::get-report-details-arguments
  [:and
   [:map
    [:report_id                                         :int]
    [:with_fields       {:optional true, :default true} :boolean]
    [:with_field_values {:optional true, :default true} :boolean]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:report_id         :report-id
                               :with_fields       :with-fields?
                               :with_field_values :with-field-values?})}]])

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
                         [:result_columns ::columns]
                         [:verified {:optional true} :boolean]]]]
   [:map [:output :string]]])

(mr/def ::get-document-details-arguments
  [:and
   [:map
    [:document_id                                         :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:document_id         :document-id})}]])

(mr/def ::get-document-details-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:id :int]
                         [:name :string]
                         [:document :string]]]]
   [:map [:output :string]]])

(mr/def ::get-tables-arguments
  [:and
   [:map
    [:database_id                                         :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:database_id         :database-id})}]])

(mr/def ::get-tables-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:database [:map
                                     [:id :int]
                                     [:engine :string]
                                     [:name :string]
                                     [:description :string]]]
                         [:tables [:sequential [:map
                                                [:id :int]
                                                [:name :string]
                                                [:description :string]
                                                [:columns [:sequential [:map
                                                                        [:id :int]
                                                                        [:name :string]
                                                                        [:description :string]
                                                                        [:type :string]]]]]]]]]]
   [:map [:output :string]]])

(mr/def ::get-table-details-arguments
  [:and
   [:map
    [:model_id                              {:optional true}                :int]
    [:table_id                              {:optional true}                [:or :int :string]]
    [:with_fields                           {:optional true, :default true} :boolean]
    [:with_field_values                     {:optional true, :default true} :boolean]
    [:with_related_tables                   {:optional true, :default true} :boolean]
    [:with_metrics                          {:optional true, :default true} :boolean]
    [:with_metric_default_temporal_breakout {:optional true, :default true} :boolean]]
   [:fn {:error/message "Exactly one of model_id and table_id required"}
    #(= (count (select-keys % [:model_id :table_id])) 1)]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:model_id                              :model-id
                               :table_id                              :table-id
                               :with_fields                           :with-fields?
                               :with_field_values                     :with-field-values?
                               :with_related_tables                   :with-related-tables?
                               :with_metrics                          :with-metrics?
                               :with_metric_default_temporal_breakout :with-default-temporal-breakout?})}]])

(mr/def ::table-result
  [:schema
   {:registry {::table-result
               [:map
                [:id :int]
                [:type [:enum :model :table]]
                [:name :string]
                [:display_name :string]
                [:database_id :int]
                [:database_schema {:optional true} [:maybe :string]] ; Schema name, if applicable
                [:fields ::columns]
                [:related_tables {:optional true} [:sequential [:ref ::table-result]]]
                [:description {:optional true} [:maybe :string]]
                [:metrics {:optional true} [:sequential ::basic-metric]]]}}
   ::table-result])

(mr/def ::get-table-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output ::table-result]]
   [:map [:output :string]]])

(mr/def ::basic-transform
  [:map
   {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:type [:enum {:decode/tool-api-response name} "mbql" "native" "python"]]
   [:description {:optional true} [:maybe :string]]
   [:entity_id {:optional true} [:maybe :string]]
   ;; :source keys are not snake_cased to match what the FE expects / provides in user_is_viewing context
   [:source ::metabot-v3.tools.transforms/transform-source]])

(mr/def ::full-transform
  [:merge
   ::basic-transform
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:created_at ms/TemporalString]
    [:updated_at ms/TemporalString]
    ;; :target keys are not snake_cased to match what the FE expects / provides in user_is_viewing context
    [:target ::metabot-v3.tools.transforms/transform-target]]])

(mr/def ::get-transforms-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:sequential ::basic-transform]]]
   [:map [:output :string]]])

(mr/def ::get-transform-details-arguments
  [:and
   [:map
    [:transform_id :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:transform_id :transform-id})}]])

(mr/def ::get-transform-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:sequential ::full-transform]]]
   [:map [:output :string]]])

(mr/def ::get-transform-python-library-details-arguments
  [:and
   [:map
    [:path :string]]
   [:map {:encode/tool-api-request
          #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::get-transform-python-library-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:source :string]
                         [:path :string]
                         [:created_at ms/TemporalString]
                         [:updated_at ms/TemporalString]]]]
   [:map [:output :string]]])

(mr/def ::answer-sources-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:metrics [:sequential ::full-metric]]
                         [:models  [:sequential ::table-result]]]]]
   [:map [:output :string]]])

(mr/def ::basic-snippet
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::full-snippet
  [:merge
   ::basic-snippet
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:content :string]]])

(mr/def ::get-snippets-result
  "Schema for SQL snippet list results"
  [:map
   {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:structured_output [:sequential ::basic-snippet]]])

(mr/def ::get-snippet-details-arguments
  [:and
   [:map
    [:snippet_id :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:snippet_id :snippet-id})}]])

(mr/def ::get-snippet-details-result
  "Schema for SQL snippet detail results"
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:structured_output ::full-snippet]])

(api.macros/defendpoint :post "/answer-sources" :- [:merge ::answer-sources-result ::tool-request]
  "Return top level meta information about available information sources."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments {:optional true} ::answer-sources-arguments]]
                                                    ::tool-request]
   {:keys [metabot-v3/metabot-id]}]
  (metabot-v3.context/log (assoc body :api :answer-sources) :llm.log/llm->be)
  (if-let [normalized-metabot-id (metabot-v3.config/normalize-metabot-id metabot-id)]
    (let [options (mc/encode ::answer-sources-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
      (doto (-> (mc/decode ::answer-sources-result
                           (metabot-v3.dummy-tools/answer-sources normalized-metabot-id options)
                           (mtx/transformer {:name :tool-api-response}))
                (assoc :conversation_id conversation_id))
        (metabot-v3.context/log :llm.log/be->llm)))
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
                                                    [:map [:arguments ::get-metric-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-metric-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-metric-details-arguments arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::get-metric-details-result
                         (metabot-v3.dummy-tools/get-metric-details arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

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
                                                    [:map [:arguments ::get-report-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-report-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-report-details-arguments arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::get-report-details-result
                         (metabot-v3.dummy-tools/get-report-details arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/get-document-details" :- [:merge ::get-document-details-result ::tool-request]
  "Get information about a given report."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::get-document-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-document-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-document-details-arguments arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::get-document-details-result
                         (metabot-v3.dummy-tools/get-document-details arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/get-table-details" :- [:merge ::get-table-details-result ::tool-request]
  "Get information about a given table or model."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::get-table-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-table-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-table-details-arguments arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::get-table-details-result
                         (metabot-v3.dummy-tools/get-table-details arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/get-tables" :- [:merge ::get-tables-result ::tool-request]
  "Get information about the tables in a given database."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::get-tables-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-tables) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-tables-arguments arguments (mtx/transformer {:name :tool-api-request}))
        database-id (:database-id arguments)]
    (doto (-> (mc/decode ::get-tables-result
                         {:structured-output {:database (t2/select-one [:model/Database :id :name :description :engine] database-id)
                                              :tables   (table-utils/database-tables database-id)}}
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/get-transforms" :- [:merge ::get-transforms-result ::tool-request]
  "Get a list of all known transforms."
  [_route-params
   _query-params
   {:keys [conversation_id] :as body} :- ::tool-request]
  (metabot-v3.context/log (assoc body :api :get-transforms) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-transforms-result
                       (metabot-v3.tools.transforms/get-transforms)
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-transform-details" :- [:merge ::get-transform-details-result ::tool-request]
  "Get information about a transform."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::get-transform-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-transform-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-transform-details-arguments arguments (mtx/transformer {:name :tool-api-request}))
        transform-id (:transform-id arguments)]
    (doto (-> (mc/decode ::get-transform-details-result
                         (metabot-v3.tools.transforms/get-transform-details transform-id)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/get-transform-python-library-details" :- [:merge
                                                                          ::get-transform-python-library-details-result
                                                                          ::tool-request]
  "Get information about a Python library by path."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments
                                                           ::get-transform-python-library-details-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :get-transform-python-library-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-transform-python-library-details-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))
        path (:path arguments)]
    (doto (-> (mc/decode ::get-transform-python-library-details-result
                         (metabot-v3.tools.transforms/get-transform-python-library-details path)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

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

;; TODO tsplude - drop the `/query-model` endpoint and filter logic in favor of this
(api.macros/defendpoint :post "/query-datasource" :- [:merge ::filtering-result ::tool-request]
  "Construct a query from a model or table data source."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::query-datasource-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :query-datasource) :llm.log/llm->be)
  (let [arguments (mc/encode ::query-datasource-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::filtering-result
                         (metabot-v3.tools.filters/query-datasource arguments)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(mr/def ::search-arguments
  [:and
   [:map
    [:term_queries        {:optional true} [:maybe [:sequential :string]]]
    [:semantic_queries    {:optional true} [:maybe [:sequential :string]]]
    [:entity_types        {:optional true} [:maybe [:sequential [:enum "table" "model" "question" "dashboard" "metric" "database" "transform"]]]]
    [:database_id         {:optional true} [:maybe :int]]
    [:created_at          {:optional true} [:maybe ms/NonBlankString]]
    [:last_edited_at      {:optional true} [:maybe ms/NonBlankString]]
    [:search_native_query {:optional true, :default false} [:maybe :boolean]]
    [:limit               {:optional true, :default 50} [:and :int [:fn #(<= 1 % 100)]]]]
   [:map {:encode/tool-api-request
          #(update-keys % (comp keyword u/->kebab-case-en))}]])

(mr/def ::search-result-item
  "Unified schema for search result items."
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:type [:enum :table :model :dashboard :question :metric :database :transform]]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_schema {:optional true} [:maybe :string]]
   [:verified {:optional true} [:maybe :boolean]]
   [:updated_at {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe :string]]
   [:collection {:optional true} [:maybe [:map
                                          [:name {:optional true} [:maybe :string]]
                                          [:authority_level {:optional true} [:maybe :string]]]]]])

(mr/def ::search-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:data [:sequential ::search-result-item]]
                         [:total_count :int]]]]
   [:map [:output :string]]])

(defn- search
  "Shared handler for the /search and /search_v2 endpoints."
  [arguments conversation_id request]
  (try
    (let [options (mc/encode ::search-arguments
                             arguments (mtx/transformer {:name :tool-api-request}))
          metabot-id (:metabot-v3/metabot-id request)
          results (metabot-v3.tools.search/search
                   (assoc options :metabot-id metabot-id))
          response-data {:data results
                         :total_count (count results)}]
      (doto (-> (mc/decode ::search-result
                           {:structured_output response-data}
                           (mtx/transformer {:name :tool-api-response}))
                (assoc :conversation_id conversation_id))
        (metabot-v3.context/log :llm.log/be->llm)))
    (catch Exception e
      (log/error e "Error in search")
      (doto (-> {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}
                (assoc :conversation_id conversation_id))
        (metabot-v3.context/log :llm.log/be->llm)))))

(api.macros/defendpoint :post "/search" :- [:merge ::search-result ::tool-request]
  "Enhanced search with term and semantic queries using Reciprocal Rank Fusion."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments {:optional true} ::search-arguments]]
                                                    ::tool-request]
   request]
  (metabot-v3.context/log (assoc body :api :search) :llm.log/llm->be)
  (search arguments conversation_id request))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :post "/search_v2" :- [:merge ::search-result ::tool-request]
  "Enhanced search with term and semantic queries using Reciprocal Rank Fusion. This is identical to /search, but
  duplicated in order to add a new capability to AI service that indicates that Metabot can search transforms. The
  /search endpoint is kept around for backward compatibility."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments {:optional true} ::search-arguments]]
                                                    ::tool-request]
   request]
  (metabot-v3.context/log (assoc body :api :search_v2) :llm.log/llm->be)
  (search arguments conversation_id request))

(api.macros/defendpoint :post "/get-snippets" :- [:merge ::get-snippets-result ::tool-request]
  "Get a list of all known SQL snippets."
  [_route-params
   _query-params
   {:keys [conversation_id] :as body} :- ::tool-request]
  (metabot-v3.context/log (assoc body :api :get-snippets) :llm.log/llm->be)
  (doto (-> (mc/decode ::get-snippets-result
                       (metabot-v3.tools.snippets/get-snippets)
                       (mtx/transformer {:name :tool-api-response}))
            (assoc :conversation_id conversation_id))
    (metabot-v3.context/log :llm.log/be->llm)))

(api.macros/defendpoint :post "/get-snippet-details" :- [:merge ::get-snippet-details-result ::tool-request]
  "Get the content of a single SQL snippet."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::get-snippet-details-arguments]]
                                                    ::tool-request]]

  (metabot-v3.context/log (assoc body :api :get-snippet-details) :llm.log/llm->be)
  (let [arguments (mc/encode ::get-snippet-details-arguments arguments (mtx/transformer {:name :tool-api-request}))
        snippet-id (:snippet-id arguments)]
    (doto (-> (mc/decode ::get-snippet-details-result
                         (metabot-v3.tools.snippets/get-snippet-details snippet-id)
                         (mtx/transformer {:name :tool-api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(mr/def ::check-transform-dependencies-arguments
  [:and
   [:map
    [:transform_id :int]
    [:source ::metabot-v3.tools.transforms/transform-source]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:transform_id :id})}]])

(mr/def ::broken-question
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]])

(mr/def ::broken-transform
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]])

(mr/def ::check-transform-dependencies-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:success :boolean]
                         [:bad_transform_count :int]
                         [:bad_transforms [:sequential ::broken-transform]]
                         [:bad_question_count :int]
                         [:bad_questions [:sequential ::broken-question]]]]]
   [:map [:output :string]]])

(api.macros/defendpoint :post "/check-transform-dependencies" :- [:merge ::check-transform-dependencies-result ::tool-request]
  "Check a proposed edit to a transform and return details of cards or transforms that would be broken by the change."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::check-transform-dependencies-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log (assoc body :api :check-transform-dependencies) :llm.log/llm->be)
  (let [arguments (mc/encode ::check-transform-dependencies-arguments arguments (mtx/transformer {:name :tool-api-request}))]
    (doto (-> (mc/decode ::check-transform-dependencies-result
                         (metabot-v3.tools.dependencies/check-transform-dependencies arguments)
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
        (respond api.response/response-unauthentic)))))

(def ^{:arglists '([handler])} +tool-session
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-tools` routes."
  (api.macros/ns-handler *ns* +tool-session))
