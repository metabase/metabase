(ns metabase-enterprise.metabot-v3.tools.api
  "Code for handling tool requests from the AI service."
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
    :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.deftool :refer [deftool]]
   [metabase-enterprise.metabot-v3.tools.dependencies :as metabot-v3.tools.dependencies]
   [metabase-enterprise.metabot-v3.tools.entity-details :as metabot-v3.tools.entity-details]
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
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn- decode-ai-service-token
  [token]
  (try
    (when (string? token)
      (jwt/decrypt token (buddy-hash/sha256 (metabot-v3.settings/site-uuid-for-metabot-tools))))
    (catch Exception e
      (log/error e "Bad AI service token")
      nil)))

;;; ------------------------------------------------ Shared Schemas -------------------------------------------------
;; NOTE: Some of these schemas are duplicated with small differences in the Agent API
;; (metabase-enterprise.agent-api.api). If you update schemas here, check if the
;; corresponding Agent API schemas need updating too.

(mr/def ::bucket
  (into [:enum {:error/message           "Valid bucket"
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
                 "less-than"    "less-than-or-equal"]]
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
                 "equals"       "not-equals"
                 "greater-than" "greater-than-or-equal"
                 "less-than"    "less-than-or-equal"]]
    [:value [:or :int :double]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-numeric-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals" "not-equals"]]
    [:values [:sequential [:or :int :double]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::segment-filter
  "Filter using a pre-defined segment."
  [:and
   [:map
    [:segment_id :int]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::filter
  [:or
   ::segment-filter
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
              "minute", "hour" "day" "week" "month" "quarter" "year" "day-of-week"]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::count-aggregation
  "Count aggregation — counts rows, no field_id needed.
   Use sort_order to order results by this aggregation ('asc' or 'desc')."
  [:and
   [:map
    [:function [:= {:encode/tool-api-request keyword} "count"]]
    [:bucket {:optional true} ::bucket]
    [:sort_order {:optional true} [:maybe [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::field-aggregation
  "Aggregation using a field and function. field_id is required.
   Use sort_order to order results by this aggregation ('asc' or 'desc')."
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]
    [:sort_order {:optional true} [:maybe [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]
    [:function [:enum {:encode/tool-api-request keyword}
                "avg" "count-distinct" "max" "min" "sum"]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::measure-aggregation
  "Aggregation using a pre-defined measure."
  [:and
   [:map
    [:measure_id :int]
    [:sort_order {:optional true} [:maybe [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::aggregation
  "Aggregation — count (field optional), field-based (field required), or measure-based."
  [:or ::count-aggregation ::field-aggregation ::measure-aggregation])

(mr/def ::field
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(mr/def ::order-by
  "Order by item specifying a field and sort direction."
  [:map
   [:field ::field]
   [:direction [:enum {:encode/tool-api-request keyword} "asc" "desc"]]])

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

(mr/def ::field-type
  [:enum {:decode/tool-api-response #(when % (-> % name u/->snake_case_en))}
   "boolean" "date" "datetime" "time" "number" "string"])

(mr/def ::column
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:field_id :string]
   [:name :string]
   [:type [:maybe ::field-type]]
   [:description {:optional true} [:maybe :string]]
   [:database_type {:optional true
                    :decode/tool-api-response #(some-> % name u/->snake_case_en)}
    [:maybe :string]]
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
    [:segments {:optional true} [:sequential ::segment]]
    [:verified {:optional true} :boolean]]])

(mr/def ::measure
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:definition {:optional true} [:maybe :map]]])

(mr/def ::segment
  [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:definition {:optional true} [:maybe :map]]])

(mr/def ::table-result
  [:map
   [:id :int]
   [:type [:enum :model :table]]
   [:name :string]
   [:display_name :string]
   [:database_id :int]
   [:database_engine :string]
   [:database_schema {:optional true} [:maybe :string]] ; Schema name, if applicable
   [:fields ::columns]
   [:related_tables {:optional true} [:sequential [:ref ::table-result]]]
   [:related_by {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:metrics {:optional true} [:sequential ::basic-metric]]
   [:measures {:optional true} [:sequential ::measure]]
   [:segments {:optional true} [:sequential ::segment]]])

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

;;; ---------------------------------------------- Discovery & Search -----------------------------------------------

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

(mr/def ::answer-sources-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:metrics [:sequential ::full-metric]]
                         [:models  [:sequential ::table-result]]]]]
   [:map [:output :string]]])

(deftool "/answer-sources"
  "Return top level meta information about available information sources."
  {:args-schema    ::answer-sources-arguments
   :args-optional? true
   :result-schema  ::answer-sources-result
   :handler        metabot-v3.tools.entity-details/answer-sources})

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
    [:limit               {:optional true, :default 50} [:and :int [:fn #(<= 1 % 100)]]]
    [:weights             {:optional true} [:map-of :keyword number?]]]
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
                                          [:authority_level {:optional true} [:maybe :string]]
                                          [:description {:optional true} [:maybe :string]]]]]])

(mr/def ::search-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map
                         [:data [:sequential ::search-result-item]]
                         [:total_count :int]]]]
   [:map [:output :string]]])

(deftool "/search"
  "Enhanced search with term and semantic queries using Reciprocal Rank Fusion."
  {:args-schema    ::search-arguments
   :args-optional? true
   :result-schema  ::search-result
   :handler        metabot-v3.tools.search/search-tool})

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(deftool "/search_v2"
  "Enhanced search with term and semantic queries using Reciprocal Rank Fusion. This is identical to /search, but
  duplicated in order to add a new capability to AI service that indicates that Metabot can search transforms. The
  /search endpoint is kept around for backward compatibility."
  {:args-schema    ::search-arguments
   :args-optional? true
   :result-schema  ::search-result
   :handler        metabot-v3.tools.search/search-tool})

;;; ----------------------------------------------------- Actions -----------------------------------------------------

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
    [:channel_type {:optional true, :default "email"}
     [:enum {:encode/tool-api-request keyword} "email" "slack"]]
    [:email {:optional true} :string]
    [:slack_channel {:optional true} :string]
    [:schedule ::subscription-schedule]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(deftool "/create-dashboard-subscription"
  "Create a dashboard subscription."
  {:args-schema   ::create-dashboard-subscription-arguments
   :result-schema [:map [:error  {:optional true} :string
                         :output {:optional true} :string]]
   :handler       metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription})

;;; ---------------------------------------------------- Analytics ----------------------------------------------------

(mr/def ::field-values-arguments
  [:and
   [:map
    [:entity_type [:enum "table" "model" "metric"]]
    [:entity_id :int]
    [:field_id :string]
    [:limit {:optional true} [:maybe :int]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

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

(deftool "/field-values"
  "Return statistics and/or values for a given field of a given entity."
  {:args-schema   ::field-values-arguments
   :result-schema ::field-values-result
   :handler       metabot-v3.tools.field-stats/field-values})

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

(deftool "/find-outliers"
  "Find outliers in the values provided by a data source for a given column."
  {:args-schema   ::find-outliers-arguments
   :result-schema ::find-outliers-result
   :handler       metabot-v3.tools.find-outliers/find-outliers})

(mr/def ::generate-insights-arguments
  [:map
   ;; query should not be changed to kebab-case
   {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}
   [:for [:or
          [:map [:metric_id :int]]
          [:map [:table_id :string]]
          [:map [:report_id :int]]
          [:map [:query :map]]]]])

(deftool "/generate-insights"
  "Generate insights."
  {:args-schema   ::generate-insights-arguments
   :result-schema [:map
                   [:output :string]
                   [:reactions [:sequential :metabot.reaction/redirect]]]
   :handler       metabot-v3.tools.generate-insights/generate-insights})

;;; -------------------------------------------------- Entity Details -------------------------------------------------

(mr/def ::get-current-user-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
                         [:id :int]
                         [:type [:= :user]]
                         [:name :string]
                         [:email_address :string]
                         [:glossary [:maybe [:map-of :string :string]]]]]]
   [:map [:output :string]]])

(deftool "/get-current-user"
  "Get information about user that started the conversation."
  {:result-schema ::get-current-user-result
   :handler       metabot-v3.tools.entity-details/get-current-user})

(mr/def ::get-dashboard-details-arguments
  [:and
   [:map [:dashboard_id :int]]
   [:map {:encode/tool-api-request #(set/rename-keys % {:dashboard_id :dashboard-id})}]])

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

(deftool "/get-dashboard-details"
  "Get information about a given dashboard."
  {:args-schema   ::get-dashboard-details-arguments
   :result-schema ::get-dashboard-details-result
   :handler       metabot-v3.tools.entity-details/get-dashboard-details})

(mr/def ::get-metric-details-arguments
  [:and
   [:map
    [:metric_id                                                      :int]
    [:with_default_temporal_breakout {:optional true, :default true} :boolean]
    [:with_field_values              {:optional true, :default true} :boolean]
    [:with_queryable_dimensions      {:optional true, :default true} :boolean]
    [:with_segments                  {:optional true, :default false} :boolean]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:metric_id                      :metric-id
                               :with_default_temporal_breakout :with-default-temporal-breakout?
                               :with_field_values              :with-field-values?
                               :with_queryable_dimensions      :with-queryable-dimensions?
                               :with_segments                  :with-segments?})}]])

(mr/def ::get-metric-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output ::full-metric]]
   [:map [:output :string]]])

(deftool "/get-metric-details"
  "Get information about a given metric."
  {:args-schema   ::get-metric-details-arguments
   :result-schema ::get-metric-details-result
   :handler       metabot-v3.tools.entity-details/get-metric-details})

(mr/def ::get-query-details-arguments
  [:map [:query :map]])

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

(deftool "/get-query-details"
  "Get information about a given query."
  {:args-schema   ::get-query-details-arguments
   :result-schema ::get-query-details-result
   :handler       metabot-v3.tools.entity-details/get-query-details})

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

(deftool "/get-report-details"
  "Get information about a given report."
  {:args-schema   ::get-report-details-arguments
   :result-schema ::get-report-details-result
   :handler       metabot-v3.tools.entity-details/get-report-details})

(mr/def ::get-document-details-arguments
  [:and
   [:map
    [:document_id :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:document_id :document-id})}]])

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

(deftool "/get-document-details"
  "Get information about a given document."
  {:args-schema   ::get-document-details-arguments
   :result-schema ::get-document-details-result
   :handler       metabot-v3.tools.entity-details/get-document-details})

(mr/def ::get-table-details-arguments
  [:and
   [:map
    [:model_id                              {:optional true}                :int]
    [:table_id                              {:optional true}                [:or :int :string]]
    [:with_fields                           {:optional true, :default true} :boolean]
    [:with_field_values                     {:optional true, :default true} :boolean]
    [:with_related_tables                   {:optional true, :default true} :boolean]
    [:with_metrics                          {:optional true, :default true} :boolean]
    [:with_metric_default_temporal_breakout {:optional true, :default true} :boolean]
    [:with_measures                         {:optional true, :default false} :boolean]
    [:with_segments                         {:optional true, :default false} :boolean]]
   [:fn {:error/message "Exactly one of model_id and table_id required"}
    #(= (count (select-keys % [:model_id :table_id])) 1)]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:model_id                              :model-id
                               :table_id                              :table-id
                               :with_fields                           :with-fields?
                               :with_field_values                     :with-field-values?
                               :with_related_tables                   :with-related-tables?
                               :with_metrics                          :with-metrics?
                               :with_metric_default_temporal_breakout :with-default-temporal-breakout?
                               :with_measures                         :with-measures?
                               :with_segments                         :with-segments?})}]])

(mr/def ::get-table-details-result
  [:or
   [:map {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output ::table-result]]
   [:map [:output :string]]])

(deftool "/get-table-details"
  "Get information about a given table or model."
  {:args-schema   ::get-table-details-arguments
   :result-schema ::get-table-details-result
   :handler       metabot-v3.tools.entity-details/get-table-details})

(mr/def ::get-tables-arguments
  [:and
   [:map
    [:database_id :int]]
   [:map {:encode/tool-api-request
          #(set/rename-keys % {:database_id :database-id})}]])

(mr/def ::get-tables-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output
     [:map
      {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
      [:database [:map
                  [:id :int]
                  [:engine :string]
                  [:name :string]
                  [:description :string]]]
      [:tables
       [:sequential
        [:map
         [:id :int]
         [:name :string]
         [:description :string]
         [:columns [:sequential
                    [:map
                     [:id :int]
                     [:name :string]
                     [:description :string]
                     [:type :string]]]]]]]]]]
   [:map [:output :string]]])

(deftool "/get-tables"
  "Get information about the tables in a given database."
  {:args-schema   ::get-tables-arguments
   :result-schema ::get-tables-result
   :handler       table-utils/get-tables})

;;; ---------------------------------------------------- Transforms ---------------------------------------------------

(mr/def ::get-transforms-result
  [:or
   [:map
    {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
    [:structured_output [:sequential ::basic-transform]]]
   [:map [:output :string]]])

(deftool "/get-transforms"
  "Get a list of all known transforms."
  {:result-schema ::get-transforms-result
   :handler       metabot-v3.tools.transforms/get-transforms})

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

(deftool "/get-transform-details"
  "Get information about a transform."
  {:args-schema   ::get-transform-details-arguments
   :result-schema ::get-transform-details-result
   :handler       metabot-v3.tools.transforms/get-transform-details})

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

(deftool "/get-transform-python-library-details"
  "Get information about a Python library by path."
  {:args-schema   ::get-transform-python-library-details-arguments
   :result-schema ::get-transform-python-library-details-result
   :handler       metabot-v3.tools.transforms/get-transform-python-library-details})

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

(deftool "/check-transform-dependencies"
  "Check a proposed edit to a transform and return details of cards or transforms that would be broken by the change."
  {:args-schema   ::check-transform-dependencies-arguments
   :result-schema ::check-transform-dependencies-result
   :handler       metabot-v3.tools.dependencies/check-transform-dependencies})

;;; ----------------------------------------------------- Querying ----------------------------------------------------

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

(deftool "/filter-records"
  "Construct a query from a metric."
  {:args-schema   ::filter-records-arguments
   :result-schema ::filtering-result
   :handler       metabot-v3.tools.filters/filter-records})

(mr/def ::query-metric-arguments
  [:and
   [:map
    [:metric_id :int]
    [:filters {:optional true} [:maybe [:sequential ::filter]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

(deftool "/query-metric"
  "Construct a query from a metric."
  {:args-schema   ::query-metric-arguments
   :result-schema ::filtering-result
   :handler       metabot-v3.tools.filters/query-metric})

(mr/def ::query-model-arguments
  [:and
   [:map
    [:model_id :int]
    [:fields {:optional true} [:maybe [:sequential ::field]]]
    [:filters {:optional true} [:maybe [:sequential ::filter]]]
    [:aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]
    [:order_by {:optional true} [:maybe [:sequential ::order-by]]]
    [:limit {:optional true} [:maybe :int]]]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

;; TODO tsplude - drop the `/query-model` endpoint and filter logic in favor of this
(deftool "/query-model"
  "Construct a query from a model."
  {:args-schema   ::query-model-arguments
   :result-schema ::filtering-result
   :handler       metabot-v3.tools.filters/query-model})

(mr/def ::query-datasource-arguments
  [:and
   [:map
    [:table_id {:optional true} :int]
    [:model_id {:optional true} :int]
    [:fields {:optional true} [:maybe [:sequential ::field]]]
    [:filters {:optional true} [:maybe [:sequential ::filter]]]
    [:aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]
    [:order_by {:optional true} [:maybe [:sequential ::order-by]]]
    [:limit {:optional true} [:maybe :int]]]
   [:fn {:error/message "Exactly one of table_id and model_id required"}
    #(= (count (select-keys % [:table_id :model_id])) 1)]
   [:map {:encode/tool-api-request #(update-keys % metabot-v3.u/safe->kebab-case-en)}]])

;; TODO tsplude - drop the `/query-model` endpoint and filter logic in favor of this
(deftool "/query-datasource"
  "Construct a query from a model or table data source."
  {:args-schema   ::query-datasource-arguments
   :result-schema ::filtering-result
   :handler       metabot-v3.tools.filters/query-datasource})

;;; --------------------------------------------------- SQL Snippets --------------------------------------------------

(mr/def ::get-snippets-result
  "Schema for SQL snippet list results"
  [:map
   {:decode/tool-api-response #(update-keys % metabot-v3.u/safe->snake_case_en)}
   [:structured_output [:sequential ::basic-snippet]]])

(deftool "/get-snippets"
  "Get a list of all known SQL snippets."
  {:result-schema ::get-snippets-result
   :handler       metabot-v3.tools.snippets/get-snippets})

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

(deftool "/get-snippet-details"
  "Get the content of a single SQL snippet."
  {:args-schema   ::get-snippet-details-arguments
   :result-schema ::get-snippet-details-result
   :handler       metabot-v3.tools.snippets/get-snippet-details})

;;; --------------------------------------------------- Middleware ----------------------------------------------------

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
