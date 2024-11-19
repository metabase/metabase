(ns metabase-enterprise.metabot-v3.tools.query
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

;; query context

(defn- legacy-MBQL->query
  [dataset-query]
  (-> (lib.metadata.jvm/application-database-metadata-provider (:database dataset-query))
      (lib/query dataset-query)))

(defn- source-table
  [query]
  (lib.metadata/table query (lib.util/source-table-id query)))

(defn- source-query
  [query]
  (lib/query query (source-table query)))

(defn- column-info
  [query column]
  {:id (:id column)
   :name (lib/display-name query column)
   :description (:description column)
   :database_type (cond
                    (lib.types.isa/boolean? column)               :boolean
                    (lib.types.isa/date-or-datetime? column)      :date
                    (lib.types.isa/numeric? column)               :number
                    (lib.types.isa/string-or-string-like? column) :string
                    :else                                         :unknown)})

(defn create-context
  "Create a tool context."
  [{:keys [dataset_query]}]
  (when dataset_query
    {:query      (-> dataset_query legacy-MBQL->query source-query)
     :run-query? false}))

(defn describe-context
  "Transforms the tool context into LLM context."
  [{:keys [query]}]
  (when query
    (let [table   (source-table query)
          columns (lib/visible-columns query)]
      {:current_table
       {:id (:id table)
        :name (lib/display-name query table)
        :description (:description table)
        :columns (mapv #(column-info query %) columns)}})))

(defn create-reactions
  "Extracts reactions based on the current context."
  [{:keys [query run-query?]}]
  (when (and query run-query?)
    [{:type          :metabot.reaction/run-query
      :dataset_query (lib.query/->legacy-MBQL query)}]))

;; validation

(defn- find-column
  [columns column-id]
  (m/find-first #(= (:id %) column-id) columns))

(defn- find-column-error
  [query columns column-id]
  (ex-info (format "%s is not a correct column_id. Available columns as JSON: %s"
                   column-id
                   (json/generate-string (mapv #(column-info query %) columns)))
           {:column column-id}))

(defn- find-operator
  [operators operator operator-map]
  (m/find-first #(= (:short %) (get operator-map operator)) operators))

(defn- find-operator-error
  [operators operator operator-map]
  (ex-info (format "%s is not a correct operator. Available operators as JSON: %s"
                   (name operator)
                   (json/generate-string (mapv #(-> % :short operator-map) operators)))
           {:operator operator}))

(defn- find-temporal-bucket
  [options unit]
  (m/find-first #(= (:unit %) unit) options))

(defn- find-temporal-bucket-error
  [options unit]
  (ex-info (format "%s is not a correct granularity. Available granularities as JSON: %s"
                   (name unit)
                   (json/generate-string (mapv #(-> % :unit name) options)))
           {:unit unit}))

;; filter-data tool

(defmulti ^:private apply-filter
  {:arglists '([query filter])}
  (fn [_query filter]
    (-> filter :operation keyword)))

(defmethod apply-filter :add_string_filter
  [query {:keys [column_id operator value]}]
  (let [columns (into [] (filter lib.types.isa/string?) (lib/filterable-columns query))
        column  (or (find-column columns column_id)
                    (find-column-error query columns column_id))
        filter  (case (keyword operator)
                  :=                (lib/= column value)
                  :!=               (lib/!= column value)
                  :contains         (lib/expression-clause :contains [column value] {:case-sensitive false})
                  :does-not-contain (lib/expression-clause :does-not-contain [column value] {:case-sensitive false})
                  :starts-with      (lib/expression-clause :starts-with [column value] {:case-sensitive false})
                  :ends-with        (lib/expression-clause :ends-with [column value] {:case-sensitive false})
                  :is-empty         (lib/is-empty column)
                  :is-not-empty     (lib/not-empty column))]
    (lib/filter query filter)))

(defmethod apply-filter :add_numeric_filter
  [query {:keys [column_id operator value]}]
  (let [columns (into [] (filter lib.types.isa/numeric?) (lib/filterable-columns query))
        column  (or (find-column columns column_id)
                    (find-column-error query columns column_id))
        filter  (case (keyword operator)
                  :=  (lib/= column value)
                  :!= (lib/!= column value)
                  :>  (lib/> column value)
                  :>= (lib/> column value)
                  :<  (lib/> column value)
                  :<= (lib/> column value))]
    (lib/filter query filter)))

(defmethod apply-filter :add_boolean_filter
  [query {:keys [column_id operator value]}]
  (let [columns (into [] (filter lib.types.isa/boolean?) (lib/filterable-columns query))
        column  (or (find-column columns column_id)
                    (find-column-error query columns column_id))
        filter  (case (keyword operator)
                  :=  (lib/= column value)
                  :!= (lib/!= column value))]
    (lib/filter query filter)))

(defmethod apply-filter :add_exact_date_filter
  [query {:keys [column_id operator value]}]
  (let [columns (into [] (filter lib.types.isa/date-or-datetime?) (lib/filterable-columns query))
        column  (or (find-column columns column_id)
                    (find-column-error query columns column_id))
        filter  (case (keyword operator)
                  :=  (lib/= column value)
                  :!= (lib/!= column value)
                  :>  (lib/> column value)
                  :>= (lib/>= column value)
                  :<  (lib/< column value)
                  :<= (lib/<= column value))]
    (lib/filter query filter)))

(defmethod apply-filter :add_date_part_filter
  [query {:keys [column_id date_part operator value]}]
  (let [columns   (into [] (filter lib.types.isa/date-or-datetime?) (lib/filterable-columns query))
        column    (or (find-column columns column_id)
                      (find-column-error query columns column_id))
        date-expr (case (keyword date_part)
                    :year         (lib.expression/get-year column)
                    :quarter      (lib.expression/get-quarter column)
                    :month        (lib.expression/get-month column)
                    :day          (lib.expression/get-day column)
                    :hour         (lib.expression/get-hour column)
                    :minute       (lib.expression/get-minute column)
                    :second       (lib.expression/get-second column)
                    :day-of-week  (lib.expression/get-day-of-week column))
        filter    (case (keyword operator)
                    :=  (lib/= date-expr value)
                    :!= (lib/!= date-expr value)
                    :>  (lib/> date-expr value)
                    :>= (lib/> date-expr value)
                    :<  (lib/> date-expr value)
                    :<= (lib/> date-expr value))]
    (lib/filter query filter)))

(defn- apply-filters
  [query filters]
  (reduce apply-filter query filters))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/filter-data
  [_tool-name {:keys [filters]} {:keys [query] :as context}]
  (try
    {:output  "success"
     :context (merge context {:query      (apply-filters query filters)
                              :run-query? true})}
    (catch ExceptionInfo e
      (log/debug e "Error in filter-data tool")
      {:output  (ex-message e)
       :context (merge context {:query query
                                :run-query? false})})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/filter-data
  [_tool-name {:keys [query]}]
  (some? query))

;; aggregate-data tool

(def ^:private aggregation-operator-map
  {:count              :count
   :count-distinct     :distinct
   :sum                :sum
   :max                :max
   :min                :min
   :average            :avg
   :standard-deviation :stddev})

(defn- apply-summarize
  [query {:keys [function column_id]}]
  (let [operators (lib/available-aggregation-operators query)
        operator  (or (find-operator operators (keyword function) aggregation-operator-map)
                      (throw (find-operator-error operators (keyword function) aggregation-operator-map)))]
    (if (:requires-column? operator)
      (let [columns   (lib/aggregation-operator-columns operator)
            column    (or (find-column columns column_id)
                          (throw (find-column-error query columns column_id)))]
        (lib/aggregate query (lib/aggregation-clause operator column)))
      (lib/aggregate query (lib/aggregation-clause operator)))))

(defn- apply-group-by
  [query {:keys [column_id granularity] :as group-by}]
  (if group-by
    (let [columns (lib/breakoutable-columns query)
          column  (or (find-column columns column_id)
                      (throw (find-column-error query columns column_id)))
          buckets (lib/available-temporal-buckets query column)
          bucket  (when granularity
                    (or (find-temporal-bucket buckets (keyword granularity))
                        (throw (find-temporal-bucket-error buckets (keyword granularity)))))]
      (lib/breakout query (cond-> column
                            bucket (lib/with-temporal-bucket bucket))))
    query))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/aggregate-data
  [_tool-name {:keys [summarize group-by]} {:keys [query] :as context}]
  (try
    {:output "success"
     :context (merge context {:query      (-> query (apply-summarize summarize) (apply-group-by group-by))
                              :run-query? true})}
    (catch ExceptionInfo e
      (log/debug e "Error in aggregate-data tool")
      {:output (ex-message e)
       :context (merge context {:query      query
                                :run-query? false})})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/aggregate-data
  [_tool-name {:keys [query]}]
  (some? query))
