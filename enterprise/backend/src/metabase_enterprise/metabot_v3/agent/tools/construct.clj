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
        enum-keys #{:operation :bucket :function :sort-order :direction :field-granularity}
        normalize-enum (fn [v]
                         (cond
                           (keyword? v) v
                           (string? v) (case v
                                         "ascending" :asc
                                         "descending" :desc
                                         (keyword v))
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
   [:function [:enum "count" "count-distinct" "distinct" "sum" "min" "max" "avg"]]
   [:sort_order {:optional true} [:maybe [:enum "ascending" "descending"]]]
   [:bucket {:optional true} [:maybe :string]]])

(def ^:private construct-measure-aggregation-schema
  [:map {:closed true}
   [:measure_id :int]
   [:sort_order {:optional true} [:maybe :string]]])

(def ^:private construct-metric-schema
  [:or construct-field-aggregation-schema construct-measure-aggregation-schema])

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
   "contains"           "not-contains"
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

(def ^:private construct-filter-schema
  [:or
   construct-multi-value-filter-schema
   construct-single-value-filter-schema
   construct-no-value-filter-schema
   construct-segment-filter-schema])

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
   [:aggregations [:sequential construct-metric-schema]]
   [:filters [:sequential construct-filter-schema]]
   [:group_by [:sequential construct-field-schema]]
   [:limit [:maybe :int]]
   [:visualization {:optional true} construct-visualization-schema]])

(def ^:private construct-query-raw-schema
  [:map {:closed true}
   [:query_type [:enum "raw"]]
   [:source [:or construct-source-model-schema construct-source-table-schema]]
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
        normalized (assoc normalized :operation (normalize-construct-operation (:operation normalized)))]
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
      (dissoc normalized :filter-type))))

(defn- normalize-construct-filters
  [filters]
  (mapv normalize-construct-filter filters))

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
  "Construct and visualize a notebook query from a metric, model, or table."
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
                                       :aggregations (normalize-ai-args (:aggregations normalized-query))
                                       :filters      (normalize-construct-filters (:filters normalized-query))
                                       :group-by     (normalize-ai-args (:group-by normalized-query))
                                       :limit        (:limit normalized-query)})
                                     :raw
                                     (filter-tools/query-datasource
                                      {:model-id (get-in normalized-query [:source :model-id])
                                       :table-id (get-in normalized-query [:source :table-id])
                                       :fields   (normalize-ai-args (:fields normalized-query))
                                       :filters  (normalize-construct-filters (:filters normalized-query))
                                       :order-by (normalize-ai-args (:order-by normalized-query))
                                       :limit    (:limit normalized-query)})
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
