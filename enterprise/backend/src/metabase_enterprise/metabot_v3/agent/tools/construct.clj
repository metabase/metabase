(ns metabase-enterprise.metabot-v3.agent.tools.construct
  "Notebook query construction tool wrappers."
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.tmpl :as te]
   [metabase-enterprise.metabot-v3.tools.create-chart :as create-chart-tools]
   [metabase-enterprise.metabot-v3.tools.filters :as filter-tools]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.llm-representations :as llm-rep]
   [metabase-enterprise.metabot-v3.util :as metabot-u]
   [metabase.lib.core :as lib]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- normalize-ai-args
  "Normalize nested tool arguments to kebab-case keys and keyword enums."
  [value]
  (let [normalized (when value
                     (metabot-u/recursive-update-keys value metabot-u/safe->kebab-case-en))
        enum-keys #{:operation :bucket :function :sort-order :direction :field-granularity :filter-type :operator}
        normalize-enum (fn [v]
                         (cond
                           (keyword? v) (-> v name metabot-u/safe->kebab-case-en keyword)
                           (string? v) (let [normalized-v (metabot-u/safe->kebab-case-en v)]
                                         (case normalized-v
                                           "ascending" :asc
                                           "descending" :desc
                                           (keyword normalized-v)))
                           :else v))]
    (walk/postwalk
     (fn [x]
       (if (map? x)
         (reduce-kv (fn [m k v]
                      (assoc m k (if (enum-keys k) (normalize-enum v) v)))
                    {}
                    x)
         x))
     normalized)))

;; Query construction is handled by construct_notebook_query for parity with ai-service.

(def ^:private construct-field-schema
  [:map {:closed true}
   [:field_id :string]
   [:field_granularity {:optional true} [:maybe :string]]
   [:bucket {:optional true} [:maybe :string]]])

(def ^:private construct-field-aggregation-schema
  [:map {:closed true}
   [:field_id {:optional true} :string]
   ;; expression_ref allows aggregating on a named expression (calculated column)
   [:expression_ref {:optional true} :string]
   [:function [:enum "count" "count-distinct" "distinct" "sum" "min" "max" "avg"
               ;; Advanced aggregations
               "median" "stddev" "var" "percentile"
               "cum-sum" "cum-count" "share"]]
   [:sort_order {:optional true} [:maybe [:enum "ascending" "descending"]]]
   [:bucket {:optional true} [:maybe :string]]
   ;; For percentile function (0-1 range, e.g., 0.95 for 95th percentile)
   [:percentile_value {:optional true} [:maybe number?]]])

(def ^:private construct-measure-aggregation-schema
  [:map {:closed true}
   [:measure_id :int]
   [:sort_order {:optional true} [:maybe :string]]])

(def ^:private construct-order-by-schema
  [:map {:closed true}
   [:field construct-field-schema]
   [:direction :string]])

;; Canonical operation values per filter_type.
;; These appear as enum constraints in the JSON Schema sent to the LLM.
(def ^:private multi-value-operations
  ["equals"             "not-equals"
   "string-starts-with" "string-ends-with"
   "string-contains"    "string-not-contains"
   ;; aliases the LLM may send from system-instruction shorthand
   "contains"           "not-contains" "does-not-contain"
   "starts-with"        "ends-with"])

(def ^:private single-value-operations
  ["greater-than"          "greater-than-or-equal"
   "less-than"             "less-than-or-equal"
   ;; LLM may use equals/not-equals with a single value instead of multi_value
   "equals"                "not-equals"])

(def ^:private no-value-operations
  ["is-null"            "is-not-null"
   "string-is-empty"    "string-is-not-empty"
   "is-true"            "is-false"
   ;; aliases
   "is-empty"           "is-not-empty"])

(def ^:private construct-multi-value-filter-schema
  [:map {:closed true
         :decode/tool filter-tools/decode-temporal-filter}
   [:filter_type [:enum "multi_value"]]
   [:field_id :string]
   [:operation (into [:enum] multi-value-operations)]
   [:bucket {:optional true} [:maybe :string]]
   [:value {:optional true} [:maybe :any]]
   [:values {:optional true} [:maybe [:sequential :any]]]])

(def ^:private construct-single-value-filter-schema
  [:map {:closed true
         :decode/tool filter-tools/decode-temporal-filter}
   [:filter_type [:enum "single_value"]]
   [:field_id :string]
   [:operation (into [:enum] single-value-operations)]
   [:bucket {:optional true} [:maybe :string]]
   [:value {:optional true} [:maybe :any]]
   [:values {:optional true} [:maybe [:sequential :any]]]])

(def ^:private construct-no-value-filter-schema
  [:map {:closed true}
   [:filter_type [:enum "no_value"]]
   [:field_id :string]
   [:operation (into [:enum] no-value-operations)]])

(def ^:private construct-segment-filter-schema
  [:map {:closed true}
   [:filter_type [:enum "segment"]]
   [:segment_id :int]])

(def ^:private construct-between-filter-schema
  [:map {:closed true
         :decode/tool filter-tools/decode-temporal-filter}
   [:filter_type [:enum "between"]]
   [:field_id :string]
   [:lower_value :any]
   [:upper_value :any]
   [:bucket {:optional true} [:maybe :string]]])

;; Non-compound filter schema (used inside compound filters to avoid infinite recursion)
(def ^:private construct-leaf-filter-schema
  "Filter schema without compound - used as children of compound filters."
  [:or
   construct-multi-value-filter-schema
   construct-single-value-filter-schema
   construct-no-value-filter-schema
   construct-segment-filter-schema
   construct-between-filter-schema])

;; Recursive filter schema so compound filters can be nested.
(def ^:private construct-filter-registry
  {::construct-filter
   [:or
    construct-leaf-filter-schema
    [:map {:closed true}
     [:filter_type [:enum "compound"]]
     [:operator [:enum "and" "or"]]
     [:filters [:sequential {:min 1} [:ref ::construct-filter]]]]]})

(def ^:private construct-filter-schema
  [:schema {:registry construct-filter-registry}
   [:ref ::construct-filter]])

;; Simple filter schema for conditional aggregation conditions.
;; Conditions don't need compound (AND/OR) filters - those are for top-level filters only.
(def ^:private construct-simple-condition-filter-schema
  "Non-compound filter schema for use in conditional aggregation conditions."
  construct-leaf-filter-schema)

(def ^:private construct-conditional-aggregation-schema
  "Schema for conditional aggregations like count-where, sum-where, distinct-where."
  [:map {:closed true}
   [:field_id {:optional true} :string]
   [:function [:enum "count-where" "sum-where" "distinct-where"]]
   [:condition construct-simple-condition-filter-schema]
   [:sort_order {:optional true} [:maybe [:enum "ascending" "descending"]]]
   [:bucket {:optional true} [:maybe :string]]])

(def ^:private construct-metric-schema
  [:or
   construct-field-aggregation-schema
   construct-measure-aggregation-schema
   construct-conditional-aggregation-schema])

(def ^:private construct-source-metric-schema
  [:map {:closed true}
   [:metric_id :int]])

(def ^:private construct-source-model-schema
  [:map {:closed true}
   [:model_id :int]])

(def ^:private construct-source-table-schema
  [:map {:closed true}
   [:table_id :int]])

(def ^:private construct-visualization-schema
  [:map {:closed true}
   [:chart_type :string]])

;;; Expression schemas for calculated columns
;;
;; Expressions support nested sub-expressions as arguments, e.g.:
;; {:operation "divide"
;;  :arguments [{:operation "subtract" :arguments [...]}  ; nested expression
;;              {:field_id "t5-3"}]}                      ; field reference

(def ^:private expression-operation-enum
  "Valid operations for expressions."
  [:enum
   ;; Math operations (binary - take multiple args)
   "add" "subtract" "multiply" "divide"
   ;; Math operations (unary)
   "abs" "round" "ceil" "floor" "sqrt" "log" "exp" "power"
   ;; String operations
   "concat" "upper" "lower" "trim" "length" "substring"
   ;; Date extraction
   "get-year" "get-month" "get-day" "get-hour" "get-minute" "get-second"
   "get-quarter" "get-day-of-week"
   ;; Date arithmetic
   "datetime-add" "datetime-subtract"
   ;; Coalesce
   "coalesce"])

;; Inline sub-expression (used as an argument, doesn't have a name)
(def ^:private construct-inline-expression-schema
  "Schema for an inline/nested expression used as an argument to another expression."
  [:map {:closed true}
   [:operation expression-operation-enum]
   [:arguments [:sequential [:ref ::expression-argument]]]
   ;; Optional fields for specific operations
   [:unit {:optional true} [:maybe [:enum "year" "quarter" "month" "week" "day"
                                    "hour" "minute" "second"]]]
   [:start {:optional true} [:maybe :int]]
   [:end {:optional true} [:maybe :int]]
   [:exponent {:optional true} [:maybe number?]]])

;; Use Malli registry for recursive schema
(def ^:private expression-argument-registry
  {::expression-argument
   [:or
    [:map {:closed true} [:field_id :string]]
    [:map {:closed true} [:value :any]]
    [:map {:closed true} [:expression_ref :string]]
    construct-inline-expression-schema]})

(def ^:private construct-expression-schema
  "Schema for defining calculated columns/expressions (top-level, must have a name)."
  [:map {:closed true}
   [:name :string]
   [:operation expression-operation-enum]
   [:arguments [:schema {:registry expression-argument-registry}
                [:sequential [:ref ::expression-argument]]]]
   ;; For datetime-add/subtract operations
   [:unit {:optional true} [:maybe [:enum "year" "quarter" "month" "week" "day"
                                    "hour" "minute" "second"]]]
   ;; For substring operation
   [:start {:optional true} [:maybe :int]]
   [:end {:optional true} [:maybe :int]]
   ;; For power operation
   [:exponent {:optional true} [:maybe number?]]])

;;; Post-aggregation filter schema (HAVING equivalent)

(def ^:private construct-leaf-post-filter-schema
  "Schema for a single post-aggregation filter. References aggregations by their 0-based index."
  [:map {:closed true}
   [:aggregation_index :int]
   [:operation [:enum "greater-than" "less-than" "equals" "not-equals"
                "greater-than-or-equal" "less-than-or-equal"]]
   [:value :any]])

(def ^:private construct-compound-post-filter-schema
  "Schema for combining multiple post-aggregation filters with AND/OR."
  [:map {:closed true}
   [:filter_type [:enum "compound"]]
   [:operator [:enum "and" "or"]]
   [:filters [:sequential {:min 1} construct-leaf-post-filter-schema]]])

(def ^:private construct-post-filter-schema
  "Schema for post-aggregation filtering. Can be a simple filter or compound (AND/OR)."
  [:or
   construct-leaf-post-filter-schema
   construct-compound-post-filter-schema])

;; The LLM sometimes nests visualization inside query, so we accept it as optional
;; in each query variant and pull it out during normalization.
(def ^:private construct-query-metric-schema
  [:map {:closed true}
   [:query_type [:enum "metric"]]
   [:source construct-source-metric-schema]
   [:filters [:sequential construct-filter-schema]]
   [:group_by [:sequential construct-field-schema]]
   [:visualization {:optional true} construct-visualization-schema]])

(def ^:private construct-query-aggregate-schema
  [:map {:closed true}
   [:query_type [:enum "aggregate"]]
   [:source [:or construct-source-model-schema construct-source-table-schema]]
   [:expressions {:optional true} [:sequential construct-expression-schema]]
   [:aggregations [:sequential construct-metric-schema]]
   [:filters [:sequential construct-filter-schema]]
   [:group_by [:sequential construct-field-schema]]
   [:limit [:maybe :int]]
   [:post_filters {:optional true} [:sequential construct-post-filter-schema]]
   [:visualization {:optional true} construct-visualization-schema]])

(def ^:private construct-query-raw-schema
  [:map {:closed true}
   [:query_type [:enum "raw"]]
   [:source [:or construct-source-model-schema construct-source-table-schema]]
   [:expressions {:optional true} [:sequential construct-expression-schema]]
   [:filters [:sequential construct-filter-schema]]
   [:fields [:sequential construct-field-schema]]
   [:order_by [:sequential construct-order-by-schema]]
   [:limit [:maybe :int]]
   [:visualization {:optional true} construct-visualization-schema]])

(def ^:private construct-query-schema
  [:or construct-query-metric-schema construct-query-aggregate-schema construct-query-raw-schema])

(def ^:private construct-operation-aliases
  {"contains"     :string-contains
   "not-contains" :string-not-contains
   "does-not-contain" :string-not-contains
   "starts-with"  :string-starts-with
   "ends-with"    :string-ends-with
   "is-empty"     :string-is-empty
   "is-not-empty" :string-is-not-empty})

(defn- normalize-construct-operation
  [operation]
  (let [op (cond
             (keyword? operation) operation
             (string? operation) (keyword operation)
             :else operation)]
    (get construct-operation-aliases (name op) op)))

(defn- normalize-construct-filter
  [filter]
  (let [normalized (normalize-ai-args filter)
        filter-type (:filter-type normalized)
        ;; Only normalize operation if it exists (compound, segment, between don't have operations)
        normalized (if (:operation normalized)
                     (assoc normalized :operation (normalize-construct-operation (:operation normalized)))
                     normalized)]
    (case filter-type
      :multi-value (-> normalized
                       (dissoc :filter-type :value)
                       (update :values (fn [vals]
                                         (cond
                                           (sequential? vals) (vec vals)
                                           (some? (:value normalized)) [(:value normalized)]
                                           :else []))))
      :single-value (-> normalized
                        (dissoc :filter-type :values)
                        (assoc :value (or (:value normalized)
                                          (first (:values normalized)))))
      :no-value (-> normalized
                    (dissoc :filter-type :value :values))
      :segment (-> normalized
                   (dissoc :filter-type :field-id :operation :bucket :value :values))
      :between (-> normalized
                   (dissoc :filter-type)
                   (assoc :filter-kind :between))
      :compound (-> normalized
                    (dissoc :filter-type)
                    (assoc :filter-kind :compound)
                    (update :filters #(mapv normalize-construct-filter %)))
      (dissoc normalized :filter-type))))

(defn- normalize-construct-filters
  [filters]
  (mapv normalize-construct-filter filters))

(defn- normalize-post-filter
  "Normalize a post-filter, handling both leaf filters and compound (AND/OR) filters."
  [post-filter]
  (let [normalized (normalize-ai-args post-filter)]
    (if (= :compound (:filter-type normalized))
      ;; Compound post-filter
      (-> normalized
          (dissoc :filter-type)
          (assoc :filter-kind :compound)
          (update :filters #(mapv normalize-post-filter %)))
      ;; Leaf post-filter - just normalize the operation to keyword
      (update normalized :operation #(cond
                                       (keyword? %) %
                                       (string? %) (keyword %)
                                       :else %)))))

(defn- normalize-post-filters
  "Normalize post-filters array."
  [post-filters]
  (when (seq post-filters)
    (mapv normalize-post-filter post-filters)))

(defn- chart-type->keyword
  [chart-type]
  (cond
    (keyword? chart-type) chart-type
    (string? chart-type)  (keyword chart-type)
    :else                 chart-type))

(defn- query-type->keyword
  [query-type]
  (cond
    (keyword? query-type) query-type
    (string? query-type)  (keyword query-type)
    :else                 query-type))

(def ^:private construct-notebook-query-args-schema
  "Schema for the `construct_notebook_query` tool arguments.
  Filter sub-schemas carry `:decode/tool` transforms for temporal value coercion."
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:query construct-query-schema]
   [:visualization {:optional true} construct-visualization-schema]])

(defn- structured->query-data
  "Convert tool structured output to a map suitable for [[llm-rep/query->xml]].
  Converts the pMBQL query to legacy MBQL, JSON-encodes it, and wraps result columns."
  [{:keys [query-id query result-columns]}]
  (let [legacy-query (when (and (map? query) (:lib/type query))
                       #_{:clj-kondo/ignore [:discouraged-var]}
                       (lib/->legacy-MBQL query))]
    {:query-type    "notebook"
     :query-id      query-id
     :database_id   (:database legacy-query)
     :query-content (when legacy-query (json/encode legacy-query))
     :result        (when (seq result-columns)
                      {:result_columns result-columns})}))

(defn- structured->chart-xml
  "Render the full chart XML (matching Python Visualization.llm_representation)
  for the construct_notebook_query tool result."
  [structured chart-id chart-type]
  (llm-rep/visualization->xml
   {:chart-id               chart-id
    :queries                [(structured->query-data structured)]
    :visualization_settings {:chart_type (if chart-type (name chart-type) "table")}}))

(def ^:private tool-arg-transformer
  "Malli transformer that applies `:decode/tool` transforms declared on sub-schemas.
  Used by [[decode-tool-args]] to coerce LLM arguments (e.g., date strings → integers
  for extraction buckets) before the tool function runs."
  (mtx/transformer {:name :tool}))

(defn- decode-tool-args
  "Decode tool arguments through the Malli schema, applying `:decode/tool` transforms.
  This is attached as `:decode` metadata on the tool var so that [[run-tool]] calls it
  before invoking the tool function."
  [args]
  (mc/decode construct-notebook-query-args-schema args tool-arg-transformer))

(mu/defn ^{:tool-name "construct_notebook_query"
           :decode    decode-tool-args}
  construct-notebook-query-tool
  "Constructs a query using either a **single model OR a single metric OR a single table** as the data source, never more than one.

**Capabilities:**
- **Aggregations**: Basic (sum, avg, min, max, count, count-distinct) and advanced (median, stddev, var, percentile, cum-sum, cum-count, share)
- **Conditional aggregations**: count-where, sum-where, distinct-where with filter conditions
- **Filters**: AND/OR compound filters, between ranges, segments, and standard comparisons
- **Expressions**: Calculated columns with math, string, and date operations
- **Post-aggregation filters**: HAVING-equivalent filtering on aggregated results
- **Grouping/breakout**: With temporal bucketing support

**Limitations:**
- No joins, unions, subqueries, or cross-model/metric queries
- No window functions (except cumulative aggregations), cohort analysis
- All fields used must exist in the selected model, metric, or table

**Usage:**
- Always use an existing business metric (`metric_id`) when it matches the intended aggregate—never rebuild a metric from scratch.
    - For multiple metrics: make separate tool calls, one per metric
- For custom calculations or detailed record exploration on a specific model use the model (`model_id`). The query will operate on this single model. Only fields belonging to THIS model can be used.
- For raw table data exploration use the table (`table_id`). The query will operate on this single table. Only fields belonging to THIS table can be used.
- For categorical filters, only use values validated as present in the data.
- Use `expressions` to create calculated columns (e.g., profit margin = revenue / cost)
- Use `post_filters` to filter on aggregated results (e.g., categories with total > $10,000)

**Important Note about Metrics:**
When using metrics, be aware that they often contain built-in filters and business logic that don't need to be explicitly added. For example, metrics named with states like \"active users\", \"converted customers\", or \"paid subscribers\" already include the relevant filtering conditions (activity, conversion, payment status) in their definitions and do not require additional filters for these criteria.

Never use this tool if the user's request explicitly asks for a SQL query or requires inter-row logic (comparing different rows), or joins. Use SQL tools instead if available.

If the request is out of scope, do not use this tool — suggest alternatives or refer to a more advanced context if available"
  [{:keys [_reasoning query visualization]} :- construct-notebook-query-args-schema]
  (try
    (let [;; LLM sometimes nests visualization inside query — pull it out
          effective-viz    (or visualization (:visualization query))
          normalized-query         (normalize-ai-args (dissoc query :visualization))
          normalized-visualization (normalize-ai-args effective-viz)
          query-type               (query-type->keyword (:query-type normalized-query))
          chart-type               (or (chart-type->keyword (:chart-type normalized-visualization))
                                       :table)
          _                        (log/debug "construct_notebook_query request"
                                              {:query-type query-type
                                               :chart-type chart-type})
          query-result             (case query-type
                                     :metric
                                     (filter-tools/query-metric
                                      {:metric-id (get-in normalized-query [:source :metric-id])
                                       :filters   (normalize-construct-filters (:filters normalized-query))
                                       :group-by  (normalize-ai-args (:group-by normalized-query))})
                                     :aggregate
                                     (filter-tools/query-datasource
                                      {:model-id     (get-in normalized-query [:source :model-id])
                                       :table-id     (get-in normalized-query [:source :table-id])
                                       :expressions  (normalize-ai-args (:expressions normalized-query))
                                       :aggregations (normalize-ai-args (:aggregations normalized-query))
                                       :filters      (normalize-construct-filters (:filters normalized-query))
                                       :group-by     (normalize-ai-args (:group-by normalized-query))
                                       :limit        (:limit normalized-query)
                                       :post-filters (normalize-post-filters (:post-filters normalized-query))})
                                     :raw
                                     (filter-tools/query-datasource
                                      {:model-id    (get-in normalized-query [:source :model-id])
                                       :table-id    (get-in normalized-query [:source :table-id])
                                       :expressions (normalize-ai-args (:expressions normalized-query))
                                       :fields      (normalize-ai-args (:fields normalized-query))
                                       :filters     (normalize-construct-filters (:filters normalized-query))
                                       :order-by    (normalize-ai-args (:order-by normalized-query))
                                       :limit       (:limit normalized-query)})
                                     {:output (str "Unsupported query_type: " query-type)})
          structured               (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [chart-result (create-chart-tools/create-chart
                            {:query-id      (:query-id structured)
                             :chart-type    chart-type
                             :queries-state {(:query-id structured) (:query structured)}})
              navigate-url (get-in chart-result [:reactions 0 :url])
              full-structured (assoc structured
                                     :result-type   :query
                                     :chart-id      (:chart-id chart-result)
                                     :chart-type    (:chart-type chart-result)
                                     :chart-link    (:chart-link chart-result)
                                     :chart-content (:chart-content chart-result))
              instruction-text
              (let [link (te/link "Chart" "metabase://chart/" (:chart-id chart-result))]
                (te/lines
                 "Your query and chart have been created successfully."
                 ""
                 "Next steps to present the chart to the user:"
                 (str "- Always provide a direct link using: `" link "` where Chart is a meaningful link text")
                 "- If creating multiple charts, present all chart links"))
              chart-xml (structured->chart-xml structured (:chart-id chart-result) chart-type)]
          {:output (str "<result>\n" chart-xml "\n</result>\n"
                        "<instructions>\n" instruction-text "\n</instructions>")
           :data-parts        (when navigate-url
                                [(streaming/navigate-to-part navigate-url)])
           :structured-output full-structured
           :instructions      instruction-text})
        ;; query-result may already have :output (error) or only :structured-output
        (if-let [s (or (:structured-output query-result) (:structured_output query-result))]
          (let [query-xml        (llm-rep/query->xml (structured->query-data s))
                instruction-text (instructions/query-created-instructions-for (:query-id s))]
            (assoc query-result
                   :output (str "<result>\n" query-xml "\n</result>\n"
                                "<instructions>\n" instruction-text "\n</instructions>")))
          query-result)))
    (catch Exception e
      (log/error e "Failed to construct notebook query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct notebook query: " (or (ex-message e) "Unknown error"))}))))
