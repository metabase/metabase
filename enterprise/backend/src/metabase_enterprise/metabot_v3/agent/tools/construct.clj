(ns metabase-enterprise.metabot-v3.agent.tools.construct
  "Notebook query construction tool wrappers."
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.tools.create-chart :as create-chart-tools]
   [metabase-enterprise.metabot-v3.tools.filters :as filter-tools]
   [metabase-enterprise.metabot-v3.util :as metabot-u]
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
   [:field_id :string]
   [:function :string]
   [:sort_order {:optional true} [:maybe :string]]
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

(def ^:private construct-field-filter-schema
  [:map {:closed true}
   [:filter_type [:enum "multi_value" "single_value" "no_value"]]
   [:field_id :string]
   [:operation :string]
   [:bucket {:optional true} [:maybe :string]]
   [:value {:optional true} [:maybe :any]]
   [:values {:optional true} [:maybe [:sequential :any]]]])

(def ^:private construct-segment-filter-schema
  [:map {:closed true}
   [:filter_type [:enum "segment"]]
   [:segment_id :int]])

(def ^:private construct-filter-schema
  [:or construct-field-filter-schema construct-segment-filter-schema])

(def ^:private construct-source-metric-schema
  [:map {:closed true}
   [:metric_id :int]])

(def ^:private construct-source-model-schema
  [:map {:closed true}
   [:model_id :int]])

(def ^:private construct-source-table-schema
  [:map {:closed true}
   [:table_id :int]])

(def ^:private construct-query-metric-schema
  [:map {:closed true}
   [:query_type [:enum "metric"]]
   [:source construct-source-metric-schema]
   [:filters [:sequential construct-filter-schema]]
   [:group_by [:sequential construct-field-schema]]])

(def ^:private construct-query-aggregate-schema
  [:map {:closed true}
   [:query_type [:enum "aggregate"]]
   [:source [:or construct-source-model-schema construct-source-table-schema]]
   [:aggregations [:sequential construct-metric-schema]]
   [:filters [:sequential construct-filter-schema]]
   [:group_by [:sequential construct-field-schema]]
   [:limit [:maybe :int]]])

(def ^:private construct-query-raw-schema
  [:map {:closed true}
   [:query_type [:enum "raw"]]
   [:source [:or construct-source-model-schema construct-source-table-schema]]
   [:filters [:sequential construct-filter-schema]]
   [:fields [:sequential construct-field-schema]]
   [:order_by [:sequential construct-order-by-schema]]
   [:limit [:maybe :int]]])

(def ^:private construct-query-schema
  [:or construct-query-metric-schema construct-query-aggregate-schema construct-query-raw-schema])

(def ^:private construct-visualization-schema
  [:map {:closed true}
   [:chart_type :string]])

(def ^:private construct-operation-aliases
  {"contains" :string-contains
   "not-contains" :string-not-contains
   "starts-with" :string-starts-with
   "ends-with" :string-ends-with
   "is-empty" :string-is-empty
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
    (string? chart-type) (keyword chart-type)
    :else chart-type))

(defn- query-type->keyword
  [query-type]
  (cond
    (keyword? query-type) query-type
    (string? query-type) (keyword query-type)
    :else query-type))

(mu/defn ^{:tool-name "construct_notebook_query"} construct-notebook-query-tool
  "Construct and visualize a notebook query from a metric, model, or table."
  [{:keys [reasoning query visualization]} :- [:map {:closed true}
                                               [:reasoning :string]
                                               [:query construct-query-schema]
                                               [:visualization construct-visualization-schema]]]
  (try
    (let [normalized-query (normalize-ai-args query)
          normalized-visualization (normalize-ai-args visualization)
          query-type (query-type->keyword (:query-type normalized-query))
          chart-type (chart-type->keyword (:chart-type normalized-visualization))
          _ (log/debug "construct_notebook_query request"
                       {:query-type query-type
                        :chart-type chart-type})
          query-result (case query-type
                         :metric
                         (filter-tools/query-metric
                          {:metric-id (get-in normalized-query [:source :metric-id])
                           :filters (normalize-construct-filters (:filters normalized-query))
                           :group-by (normalize-ai-args (:group-by normalized-query))})
                         :aggregate
                         (filter-tools/query-datasource
                          {:model-id (get-in normalized-query [:source :model-id])
                           :table-id (get-in normalized-query [:source :table-id])
                           :aggregations (normalize-ai-args (:aggregations normalized-query))
                           :filters (normalize-construct-filters (:filters normalized-query))
                           :group-by (normalize-ai-args (:group-by normalized-query))
                           :limit (:limit normalized-query)})
                         :raw
                         (filter-tools/query-datasource
                          {:model-id (get-in normalized-query [:source :model-id])
                           :table-id (get-in normalized-query [:source :table-id])
                           :fields (normalize-ai-args (:fields normalized-query))
                           :filters (normalize-construct-filters (:filters normalized-query))
                           :order-by (normalize-ai-args (:order-by normalized-query))
                           :limit (:limit normalized-query)})
                         {:output (str "Unsupported query_type: " query-type)})
          structured (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [chart-result (create-chart-tools/create-chart
                            {:query-id (:query-id structured)
                             :chart-type chart-type
                             :queries-state {(:query-id structured) (:query structured)}})
              navigate-url (get-in chart-result [:reactions 0 :url])]
          {:structured-output (assoc structured
                                     :result-type :query
                                     :chart-id (:chart-id chart-result)
                                     :chart-type (:chart-type chart-result)
                                     :chart-link (:chart-link chart-result)
                                     :chart-content (:chart-content chart-result))
           :instructions (str "Your query and chart have been created successfully.\n\n"
                              "Next steps to present the chart to the user:\n"
                              "- Always provide a direct link using: `[Chart](metabase://chart/"
                              (:chart-id chart-result) ")` where Chart is a meaningful link text\n"
                              "- If creating multiple charts, present all chart links")
           :data-parts (when navigate-url
                         [(streaming/navigate-to-part navigate-url)])})
        query-result))
    (catch Exception e
      (log/error e "Failed to construct notebook query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct notebook query: " (or (ex-message e) "Unknown error"))}))))
