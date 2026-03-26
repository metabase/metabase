(ns metabase.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.agent-api.validation :as agent-api.validation]
   [metabase.agent-lib.core :as agent-lib]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.search :as metabot-search]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.metabot.util :as metabot.u]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Defaults ------------------------------------------------------

(def ^:private ^:const default-field-values-limit
  "Default number of field values to return when no limit is specified."
  30)

(def ^:private ^:const default-query-row-limit
  "Default row limit for table queries when no limit is specified."
  200)

(def ^:private ^:const max-query-row-limit
  "Hard cap on rows returned by the combined query endpoint, keeping result sets lean for LLM context windows.
   Agents can paginate via continuation tokens for more."
  200)

;;; ---------------------------------------------------- Helpers ------------------------------------------------------

(defn- check-tool-result
  "Extract :structured-output from a tool result, or throw with the appropriate HTTP status code.
   Tool functions return {:structured-output ...} on success,
   {:output \"error\" :status-code 4xx/5xx} on failure.
   Defaults to 404 if no status-code is provided for backwards compatibility."
  [{:keys [structured-output output status-code]}]
  (or structured-output
      (api/check false [(or status-code 404) (or output "Not found.")])))

;;; --------------------------------------------------- Schemas ------------------------------------------------------

;; Response schemas for the Agent API.
;; - Use snake_case keys in schema definitions (JSON convention)
;; - Use :encode/api transformers to convert kebab-case data from internal functions
;; - Convert keyword enum values (like :table, :metric) to strings for JSON

(mr/def ::field
  "A field from a table or metric. The field_id format is '<prefix><entity-id>-<field-index>' where prefix indicates the source (t=table, c=metric) and index is the position in the entity's fields."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:field_id :string]
   [:name :string]
   [:display_name :string]
   [:description {:optional true} [:maybe :string]]
   [:base_type :string]
   [:effective_type {:optional true} [:maybe :string]]
   [:semantic_type {:optional true} [:maybe :string]]
   [:database_type {:optional true} [:maybe :string]]
   [:coercion_strategy {:optional true} [:maybe :string]]
   [:field_values {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::entity-type
  "The type of queryable entity."
  [:enum :table :metric])

(mr/def ::metric-summary
  "Summary of a metric associated with a table. Includes the field_id of the default time dimension for temporal breakouts."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe :string]]])

(mr/def ::segment
  "A predefined filter condition that can be applied to queries via the segment_id in filters."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::measure
  "A reusable aggregation expression associated with a table. Reference via measure_id in the aggregations array."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::related-table
  "A table related to the queried entity via foreign key. The related_by field indicates the FK field name."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :table]]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_engine {:optional true} [:maybe :string]]
   [:database_schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:fields {:optional true} [:maybe [:sequential ::field]]]
   [:related_by {:optional true} [:maybe :string]]])

(mr/def ::table
  "Full details of a table including its fields, related tables, metrics, and segments."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type ::entity-type]
   [:name :string]
   [:display_name :string]
   [:database_id :int]
   [:database_engine :string]
   [:database_schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:fields [:sequential ::field]]
   [:related_tables {:optional true} [:maybe [:sequential ::related-table]]]
   [:metrics {:optional true} [:maybe [:sequential ::metric-summary]]]
   [:measures {:optional true} [:maybe [:sequential ::measure]]]
   [:segments {:optional true} [:maybe [:sequential ::segment]]]])

(mr/def ::metric
  "A metric with its queryable dimensions and segments. The default_time_dimension_field_id is the field_id of the recommended time dimension for temporal breakouts."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe :string]]
   [:verified {:optional true} [:maybe :boolean]]
   [:queryable_dimensions {:optional true} [:maybe [:sequential ::field]]]
   [:segments {:optional true} [:maybe [:sequential ::segment]]]])

(mr/def ::statistics
  "Statistical summary of a field's values computed during database sync. Includes counts, percentages, numeric summaries (min/max/avg/quartiles/sd), and date ranges."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
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

(mr/def ::field-values
  "Statistics and sample values for a specific field."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:field_id {:optional true} [:maybe :string]]
   [:statistics {:optional true} [:maybe ::statistics]]
   [:values {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::search-result-item
  "A table or metric returned from search."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
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
  "Search results containing tables and metrics matching the query."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:data [:sequential ::search-result-item]]
   [:total_count :int]])

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  {:scope :unchecked}
  []
  {:message "pong"})

(api.macros/defendpoint :get "/v1/table/:id" :- ::table
  "Get details for a table by ID."
  {:scope metabot/agent-table-read
   :tool  {:name "get_table"
           :description "Get details about a table including its fields, related tables, and metrics."}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-fields with-field-values with-related-tables with-metrics with-measures with-segments]
    :or   {with-fields true, with-field-values false, with-related-tables true,
           with-metrics true, with-measures false, with-segments false}}
   :- [:map
       [:with-field-values   {:optional true} [:maybe :boolean]]
       [:with-fields         {:optional true} [:maybe :boolean]]
       [:with-related-tables {:optional true} [:maybe :boolean]]
       [:with-metrics        {:optional true} [:maybe :boolean]]
       [:with-measures       {:optional true} [:maybe :boolean]]
       [:with-segments       {:optional true} [:maybe :boolean]]]]
  (check-tool-result
   (entity-details/get-table-details
    {:entity-type          :table
     :entity-id            id
     :with-fields?         with-fields
     :with-field-values?   with-field-values
     :with-related-tables? with-related-tables
     :with-metrics?        with-metrics
     :with-measures?       with-measures
     :with-segments?       with-segments})))

(api.macros/defendpoint :get "/v1/table/:id/field/:field-id/values" :- ::field-values
  "Get statistics and sample values for a table field."
  {:scope metabot/agent-table-read
   :tool  {:name "get_table_field_values"
           :description "Get sample values and statistics for a field in a table."}}
  [{:keys [id field-id]} :- [:map
                             [:id       ms/PositiveInt]
                             [:field-id {:tool/description "Field identifier in the format '<prefix><entity-id>-<field-index>', e.g. 't123-0' for a table field."}
                              ms/NonBlankString]]]
  (check-tool-result
   (field-stats/field-values
    {:entity-type "table"
     :entity-id   id
     :field-id    field-id
     :limit       (or (request/limit) default-field-values-limit)})))

(api.macros/defendpoint :get "/v1/metric/:id" :- ::metric
  "Get details for a metric by ID."
  {:scope metabot/agent-metric-read
   :tool  {:name "get_metric"
           :description "Get details about a metric including its queryable dimensions."}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-default-temporal-breakout with-field-values with-queryable-dimensions with-segments]
    :or   {with-default-temporal-breakout true, with-field-values false,
           with-queryable-dimensions true, with-segments false}}
   :- [:map
       [:with-default-temporal-breakout {:optional true} [:maybe :boolean]]
       [:with-field-values              {:optional true} [:maybe :boolean]]
       [:with-queryable-dimensions      {:optional true} [:maybe :boolean]]
       [:with-segments                  {:optional true} [:maybe :boolean]]]]
  (check-tool-result
   (entity-details/get-metric-details
    {:metric-id                       id
     :with-default-temporal-breakout? with-default-temporal-breakout
     :with-field-values?              with-field-values
     :with-queryable-dimensions?      with-queryable-dimensions
     :with-segments?                  with-segments})))

(api.macros/defendpoint :get "/v1/metric/:id/field/:field-id/values" :- ::field-values
  "Get statistics and sample values for a metric field."
  {:scope metabot/agent-metric-read
   :tool  {:name "get_metric_field_values"
           :description "Get sample values and statistics for a field in a metric."}}
  [{:keys [id field-id]} :- [:map
                             [:id       ms/PositiveInt]
                             [:field-id {:tool/description "Field identifier in the format '<prefix><entity-id>-<field-index>', e.g. 'c456-2' for a metric field."}
                              ms/NonBlankString]]]
  (check-tool-result
   (field-stats/field-values
    {:entity-type "metric"
     :entity-id   id
     :field-id    field-id
     :limit       (or (request/limit) default-field-values-limit)})))

(api.macros/defendpoint :post "/v1/search" :- ::search-response
  "Search for tables and metrics.

  Supports both term-based and semantic search queries. Results are ranked using
  Reciprocal Rank Fusion when both query types are provided."
  {:scope metabot/agent-search
   :tool  {:name "search"
           :description "Search for tables and metrics in Metabase. Use term_queries for keyword search or semantic_queries for natural language search."
           :annotations {:read-only? true}}}
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

;; Request schemas for the Agent API.
;; These use snake_case keys for validation and OpenAPI generation,
;; with :encode/tool-api-request transformers for converting to the internal format.

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::string-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"             "not-equals"
                 "string-contains"    "string-not-contains"
                 "string-starts-with" "string-ends-with"]]
    [:value :string]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-string-date-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"             "not-equals"
                 "string-contains"    "string-not-contains"
                 "string-starts-with" "string-ends-with"]]
    [:values [:sequential :string]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::numeric-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals"       "not-equals"
                 "greater-than" "greater-than-or-equal"
                 "less-than"    "less-than-or-equal"]]
    [:value [:or :int :double]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::disjunctive-numeric-filter
  [:and
   [:map
    [:field_id :string]
    [:operation [:enum {:encode/tool-api-request keyword}
                 "equals" "not-equals"]]
    [:values [:sequential [:or :int :double]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::segment-filter
  "Filter using a pre-defined segment."
  [:and
   [:map
    [:segment_id :int]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::count-aggregation
  "Count aggregation — counts rows, no field_id needed.
   Use sort_order to order results by this aggregation ('asc' or 'desc')."
  [:and
   [:map
    [:function [:= {:encode/tool-api-request keyword} "count"]]
    [:bucket {:optional true} ::bucket]
    [:sort_order {:optional true} [:maybe [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

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
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::measure-aggregation
  "Aggregation using a pre-defined measure."
  [:and
   [:map
    [:measure_id :int]
    [:sort_order {:optional true} [:maybe [:enum {:encode/tool-api-request keyword} "asc" "desc"]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::aggregation
  "Aggregation — count (field optional), field-based (field required), or measure-based."
  [:or ::count-aggregation ::field-aggregation ::measure-aggregation])

(mr/def ::field
  [:and
   [:map
    [:field_id :string]
    [:bucket {:optional true} ::bucket]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::order-by
  "Order by item specifying a field and sort direction."
  [:map
   [:field ::field]
   [:direction [:enum {:encode/tool-api-request keyword} "asc" "desc"]]])

(mr/def ::construct-query-table-request
  "Request schema for constructing a query from a table.

   Query components:
   - filters: Filter conditions to apply
   - fields: Specific fields to select (omit for all fields)
   - aggregations: Aggregation functions (sum, count, avg, etc.). Use sort_order on the aggregation to order by it.
   - group_by: Fields to group by, with optional temporal granularity
   - order_by: Order by regular fields only. To order by an aggregation result, use sort_order on the aggregation instead.
   - limit: Maximum rows to return"
  [:and
   [:map
    [:table_id ms/PositiveInt]
    [:filters      {:optional true} [:maybe [:sequential ::filter]]]
    [:fields       {:optional true} [:maybe [:sequential ::field]]]
    [:aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
    [:group_by     {:optional true} [:maybe [:sequential ::group-by]]]
    [:order_by     {:optional true
                    :description "Order by regular fields only. To order by aggregation results, use sort_order on the aggregation."}
     [:maybe [:sequential ::order-by]]]
    [:limit        {:optional true} [:maybe ms/PositiveInt]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::construct-query-metric-request
  "Request schema for constructing a query from a metric.
   Only supports filters and group_by (aggregation is defined by the metric)."
  [:and
   [:map
    [:metric_id ms/PositiveInt]
    [:filters  {:optional true} [:maybe [:sequential ::filter]]]
    [:group_by {:optional true} [:maybe [:sequential ::group-by]]]]
   [:map {:encode/tool-api-request #(update-keys % metabot.u/safe->kebab-case-en)}]])

(mr/def ::construct-query-request
  "Request schema for /v1/construct-query. Accepts either table_id or metric_id."
  [:or ::construct-query-table-request ::construct-query-metric-request])

(mr/def ::query-request
  "Request schema for /v1/query. Accepts construct params (table_id or metric_id) or a continuation_token."
  [:multi {:dispatch (fn [m]
                       (cond
                         (:continuation_token m) :continuation
                         (:metric_id m)          :metric
                         :else                   :table))}
   [:continuation [:map [:continuation_token ms/NonBlankString]]]
   [:table        ::construct-query-table-request]
   [:metric       ::construct-query-metric-request]])

(mr/def ::construct-query-response
  "Response containing a base64-encoded MBQL query for use with /v1/execute."
  [:map
   [:query ms/NonBlankString]])

(defn- body->program
  "Convert a construct-query request body into an agent-lib program.
  Maps the legacy table_id/metric_id + filters/aggregations format into the
  unified program format with source and operations."
  [body]
  (let [source (cond
                 (:table_id body)  {:type "table"  :id (:table_id body)}
                 (:metric_id body) {:type "metric" :id (:metric_id body)})
        ops    (cond-> []
                 ;; filters → ["filter", clause] for each
                 (seq (:filters body))
                 (into (map (fn [{:keys [field_id operation value values segment_id bucket]}]
                              (if segment_id
                                ["filter" ["segment" segment_id]]
                                (let [field-ref (if bucket
                                                  ["with-temporal-bucket" ["field" (parse-long field_id)] bucket]
                                                  ["field" (parse-long field_id)])]
                                  (cond
                                    (seq values) ["filter" [operation field-ref values]]
                                    (some? value) ["filter" [operation field-ref value]]
                                    :else         ["filter" [operation field-ref]])))))
                       (:filters body))

                 ;; aggregations
                 (seq (:aggregations body))
                 (into (map (fn [{:keys [field_id function measure_id]}]
                              (if measure_id
                                ["aggregate" ["measure" measure_id]]
                                (if field_id
                                  ["aggregate" [function ["field" (parse-long field_id)]]]
                                  ["aggregate" [function]]))))
                       (:aggregations body))

                 ;; group_by → breakout
                 (seq (:group_by body))
                 (into (map (fn [{:keys [field_id field_granularity]}]
                              (if field_granularity
                                ["breakout" ["with-temporal-bucket" ["field" (parse-long field_id)] field_granularity]]
                                ["breakout" ["field" (parse-long field_id)]])))
                       (:group_by body))

                 ;; fields → with-fields
                 (seq (:fields body))
                 (conj ["with-fields" (mapv (fn [{:keys [field_id]}]
                                              ["field" (parse-long field_id)])
                                            (:fields body))])

                 ;; order_by
                 (seq (:order_by body))
                 (into (map (fn [{:keys [field direction]}]
                              (let [field-ref ["field" (parse-long (:field_id field))]]
                                (if (= direction "desc")
                                  ["order-by" field-ref "desc"]
                                  ["order-by" field-ref]))))
                       (:order_by body))

                 ;; limit
                 (:limit body)
                 (conj ["limit" (:limit body)]))]
    {:source source :operations ops}))

(defn- construct-query*
  "Shared query construction: converts body to program, evaluates via agent-lib, returns the raw pMBQL query."
  [body]
  (let [program     (body->program body)
        database-id (if (:table_id body)
                      (:db_id (tools.u/get-table (:table_id body) :db_id))
                      (:database_id (tools.u/get-card (:metric_id body))))
        mp          (lib-be/application-database-metadata-provider database-id)
        context     {:source-entity       {:model (if (:table_id body) "table" "metric")
                                           :id    (or (:table_id body) (:metric_id body))}
                     :referenced-entities []
                     :surrounding-tables  []}]
    (agent-lib/evaluate-program program mp context)))

(defn- construct-table-query
  "Build a query from a table using the provided query components."
  [body]
  (let [body  (cond-> body (not (:limit body)) (assoc :limit default-query-row-limit))
        query (construct-query* body)]
    {:query (-> query json/encode u/encode-base64)}))

(defn- construct-metric-query
  "Build a query from a metric using filters and group_by."
  [body]
  {:query (-> (construct-query* body) json/encode u/encode-base64)})

(api.macros/defendpoint :post "/v1/construct-query" :- ::construct-query-response
  "Construct an MBQL query from a table or metric.

  Returns a base64-encoded MBQL query that can be used with the query API.

  For tables, supports: filters, fields, aggregations, group_by, order_by, limit.
  For metrics, supports: filters, group_by (aggregation is defined by the metric)."
  {:scope metabot/agent-query-construct
   :tool  {:name "construct_query"
           :description (str "Construct a query against a Metabase table or metric. "
                             "Returns an opaque query string that can be executed with execute_query.\n\n"
                             "For table queries: provide table_id. "
                             "Supports filters, fields, aggregations, group_by, order_by, and limit.\n\n"
                             "For metric queries: provide metric_id. "
                             "Supports only filters and group_by (aggregation is defined by the metric).\n\n"
                             "Provide either table_id or metric_id, not both.")
           :annotations {:read-only? true :idempotent? true}}}
  [_route-params
   _query-params
   body :- ::construct-query-request]
  (if (:table_id body)
    (construct-table-query body)
    (construct-metric-query body)))

;;; ------------------------------------------------- Combined Query -------------------------------------------------

(defn- generate-continuation-token
  "Build a base64-encoded continuation token containing the query and next-page pagination info."
  [query-map limit page]
  (-> {:query      query-map
       :pagination {:limit limit :page (inc page)}}
      json/encode
      u/encode-base64))

(defn- decode-continuation-token
  "Decode a base64-encoded continuation token into {:query ... :pagination ...}."
  [token]
  (-> token u/decode-base64 json/decode+kw))

(defn- build-query-for-execution
  "Construct a MBQL 5 query map from table_id or metric_id params. Returns {:query <map> :limit <int>}.
   The JSON round-trip strips lib metadata so the query is a plain MBQL 5 map suitable for token serialization."
  [body]
  (let [limit (min (or (:limit body) default-query-row-limit) max-query-row-limit)
        query (construct-query* (assoc body :limit limit))]
    {:query (json/decode+kw (json/encode query)) :limit limit}))

(defn- apply-page-to-query
  "Apply :page clause to the last stage of a MBQL 5 query map."
  [query-map page items]
  (let [stages   (:stages query-map)
        last-idx (dec (count stages))]
    (assoc-in query-map [:stages last-idx :page] {:page page :items items})))

(defn- prepare-agent-query
  "Apply standard Agent API query preparation: middleware defaults and execution info."
  [query]
  (-> query
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- prepare-combined-query
  "Apply the tighter row cap used by the combined query endpoint."
  [query]
  (assoc (prepare-agent-query query)
         :constraints {:max-results           max-query-row-limit
                       :max-results-bare-rows max-query-row-limit}))

(api.macros/defendpoint :post "/v1/query"
  :- (streaming-response/streaming-response-schema ::query-response)
  "Query a Metabase table or metric, or continue paginating a previous query.

  Accepts either construct params (table_id/metric_id + filters, aggregations, etc.)
  or a continuation_token from a previous response. Returns results with column metadata
  and an optional continuation_token for fetching the next page."
  {:scope "agent:query"
   :tool  {:name "query"
           :description (str "Query a Metabase table or metric. Returns results with column metadata. "
                             "If more rows are available, the response includes a continuation_token — "
                             "pass it back to get the next page.\n\n"
                             "For table queries: provide table_id. "
                             "Supports filters, fields, aggregations, group_by, order_by, and limit.\n\n"
                             "For metric queries: provide metric_id. "
                             "Supports only filters and group_by (aggregation is defined by the metric).\n\n"
                             "For pagination: provide only continuation_token from a previous response.\n\n"
                             "Provide exactly one of table_id, metric_id, or continuation_token.")}}
  [_route-params
   _query-params
   body :- ::query-request]
  (let [{:keys [query limit page]}
        (if-let [token (:continuation_token body)]
          (let [{:keys [query pagination]} (decode-continuation-token token)]
            {:query query :limit (:limit pagination) :page (:page pagination)})
          (let [{:keys [query limit]} (build-query-for-execution body)]
            {:query query :limit limit :page 1}))
        mbql5-with-page (apply-page-to-query query page limit)]
    (qp.streaming/streaming-response
     [rff :api]
      (qp/process-query
       (prepare-combined-query mbql5-with-page)
       (qp.streaming/transforming-query-response
        rff
        (fn [result]
          (assoc result :continuation_token
                 (when (= (:row_count result) limit)
                   (generate-continuation-token query limit page)))))))))

;;; ------------------------------------------------- Execute Query --------------------------------------------------

(mr/def ::execute-query-request
  "Request schema for /v1/execute. Accepts a base64-encoded MBQL query."
  [:map
   [:query {:tool/description "A base64-encoded query string returned by /v1/construct-query. Do not construct this value manually."}
    ms/NonBlankString]])

(mr/def ::column-metadata
  "Metadata for a single result column."
  [:map
   [:name           :string]
   [:base_type      :string]
   [:effective_type {:optional true} [:maybe :string]]
   [:display_name   :string]])

(mr/def ::execute-query-response
  "Response from query execution. The HTTP status is always 202 because results are streamed —
   check the `status` field to determine success or failure."
  [:map
   [:status       [:enum :completed :failed]]
   [:data         {:optional true}
    [:map
     [:cols [:sequential ::column-metadata]]
     [:rows [:sequential [:sequential :any]]]]]
   [:row_count    {:optional true} :int]
   [:running_time {:optional true} :int]
   [:error        {:optional true} :string]])

(mr/def ::query-response
  "Extends ::execute-query-response with an optional continuation_token for pagination."
  [:merge ::execute-query-response
   [:map [:continuation_token {:optional true} [:maybe :string]]]])

(api.macros/defendpoint :post "/v1/execute"
  :- (streaming-response/streaming-response-schema ::execute-query-response)
  "Execute an MBQL query and return results.

  Accepts a base64-encoded MBQL query (as returned by /v1/construct-query) and executes it,
  returning results with column metadata.

  Response format:
  - On success: {:data {:cols [...] :rows [...]} :row_count N :status :completed :running_time M}
  - On failure: {:status :failed :error \"message\" ...}

  Standard userspace query limits are enforced (2000 rows for simple queries, 10000 for aggregated)."
  {:scope metabot/agent-query-execute
   :tool  {:name "execute_query"
           :description "Execute a previously constructed query and return the results with column metadata, row count, and execution time."}}
  [_route-params
   _query-params
   {encoded-query :query} :- ::execute-query-request]
  (let [query (-> encoded-query
                  u/decode-base64
                  json/decode+kw)]
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query (prepare-combined-query query) rff))))

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
  "Authenticate a request using a stateless JWT. Returns `{:user <user>}` on success, or
   `{:error <type> :message <msg>}` on failure. Does NOT create a session.

   Uses auth-identity/authenticate to validate the JWT, which reuses the same implementation as the /auth/sso endpoint
   and handles all settings validation.

   When the JWT contains a `\"scope\"` claim, the result includes `:scopes` — a parsed set of scope strings — so that
   [[enforce-authentication]] can attach it to the request for downstream scope enforcement."
  [token]
  (let [result (auth-identity/authenticate :provider/jwt {:token token})]
    (if (:success? result)
      ;; JWT is valid - look up user from the email extracted by the JWT provider
      ;; The provider uses jwt-attribute-email setting to extract the email from claims
      (if-let [user (when-let [email (get-in result [:user-data :email])]
                      (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))]
        (let [scope-entry (-> result :jwt-data (find :scope))]
          (cond-> {:user user}
            scope-entry
            (assoc :scopes (or (scope/parse-scopes (val scope-entry)) #{}))))
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

   Ensures `:token-scopes` is present on authenticated requests.

   - For **session-authenticated** requests (where `:metabase-user-id` is already set by
     upstream middleware), preserves any pre-existing `:token-scopes` value if present,
     otherwise defaults to `#{::scope/unrestricted}` for unrestricted access.
   - For **JWT-authenticated** requests, derives `:token-scopes` from the JWT when a
     `\"scope\"` claim is present, falls back to any pre-existing `:token-scopes` on the
     request, and finally defaults to `#{::scope/unrestricted}` for unscoped JWTs.

   This ensures downstream scope enforcement never has to special-case nil within the
   agent API."
  [handler]
  (fn [{:keys [headers metabase-user-id token-scopes] :as request} respond raise]
    (cond
      ;; Already authenticated via X-Metabase-Session or synthetic request (e.g. MCP dispatch).
      ;; Preserve existing :token-scopes when present (MCP sets them on the synthetic request).
      metabase-user-id
      (handler (cond-> request
                 (not token-scopes) (assoc :token-scopes #{::scope/unrestricted}))
               respond raise)

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
              (do
                (when (and (:scopes result) token-scopes (not= (:scopes result) token-scopes))
                  (log/warn "JWT scopes" (:scopes result)
                            "differ from pre-existing token-scopes" token-scopes))
                (request/with-current-user (:id user)
                  (handler (assoc request :token-scopes (or (:scopes result)
                                                            token-scopes
                                                            #{::scope/unrestricted}))
                           respond raise)))
              (respond (error-response (:error result) (:message result))))))))))

(def +auth
  "Agent API authentication middleware. Supports both session-based and stateless JWT authentication."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

(def +agent-api-enabled
  "Wrap routes so they may only be accessed when the Agent API is enabled."
  agent-api.validation/+agent-api-enabled)

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes. Workspace routes are mounted separately via the EE routes file."
  (api.macros/ns-handler *ns* +auth))
