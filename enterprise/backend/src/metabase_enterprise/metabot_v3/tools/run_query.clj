(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.query :as metabot-v3.tools.query]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- find-column
  [query stage-number columns column-id step-type]
  (or (m/find-first #(= (metabot-v3.tools.query/column-id %) column-id) columns)
      (ex-info (format "%s is not a correct column for the %s step. Available columns as JSON: %s"
                       column-id
                       step-type
                       (json/generate-string (mapv #(metabot-v3.tools.query/column-info query stage-number %) columns)))
               {:column-id column-id})))

(defn- find-column-and-stage
  [query column-fn column-id step-type]
  (let [groups (into []
                     (mapcat #(map (fn [column] [column %]) (column-fn %)))
                     (range (lib/stage-count query)))]
    (or (m/find-first (fn [[column]] (= (metabot-v3.tools.query/column-id column) column-id)) groups)
        (throw (ex-info (format "%s is not a correct column for the %s step. Available columns as JSON: %s"
                                column-id
                                step-type
                                (json/generate-string (mapv (fn [[column stage-number]]
                                                              (metabot-v3.tools.query/column-info query
                                                                                                  stage-number
                                                                                                  column))
                                                            groups)))
                        {:column-id column-id})))))

(defn- find-operator
  [operators operator-name step-type]
  (or (m/find-first #(= (metabot-v3.tools.query/operator-name %) operator-name) operators)
      (ex-info (format "%s is not a correct operator for the %s step. Available operators as JSON: %s"
                       operator-name
                       step-type
                       (json/generate-string (mapv metabot-v3.tools.query/operator-name operators)))
               {:operator operator-name})))

(defn- find-operator-and-stage
  [query operator-fn operator-name step-type]
  (let [groups (into []
                     (mapcat #(map (fn [operator] [operator %]) (operator-fn %)))
                     (range (lib/stage-count query)))]
    (or (m/find-first (fn [[operator]] (= (metabot-v3.tools.query/operator-name operator) operator-name)) groups)
        (throw (ex-info (format "%s is not a correct operator for the %s step. Available operators as JSON: %s"
                                operator-name
                                step-type
                                (json/generate-string (mapv (fn [[operator]]
                                                              (metabot-v3.tools.query/operator-name operator))
                                                            groups)))
                        {:operator operator-name})))))

(defn- limit-error
  [limit]
  (ex-info "Row limit must be a non-negative number." {:limit limit}))

(defmulti apply-query-step
  "Applies a step to the query."
  {:arglists '([query step])}
  (fn [_query step]
    (-> step :type keyword)))

(defmethod apply-query-step :add-string-filter
  [query {:keys [value], step-type :type, column-id :column_id, operator-name :operator}]
  (let [query                 (lib/ensure-filter-stage query)
        [column stage-number] (find-column-and-stage query
                                                     #(into []
                                                       (filter lib.types.isa/string-or-string-like?)
                                                       (lib/filterable-columns query %))
                                                     column-id step-type)
        operators (lib/filterable-column-operators column)
        operator  (find-operator operators operator-name step-type)
        clause    (condp = (:short operator)
                         :=                (lib/= column value)
                         :!=               (lib/!= column value)
                         :contains         (lib/contains column value)
                         :does-not-contain (lib/does-not-contain column value)
                         :starts-with      (lib/starts-with column value)
                         :ends-with        (lib/ends-with column value))]
    (lib/filter query stage-number clause)))

(defmethod apply-query-step :add-number-filter
  [query {:keys [value], step-type :type, column-id :column_id, operator-name :operator}]
  (let [query                 (lib/ensure-filter-stage query)
        [column stage-number] (find-column-and-stage query
                                                     #(into []
                                                       (filter lib.types.isa/numeric?)
                                                       (lib/filterable-columns query %))
                                                     column-id step-type)
        operators (lib/filterable-column-operators column)
        operator  (find-operator operators operator-name step-type)
        clause    (condp = (:short operator)
                    :=  (lib/= column value)
                    :!= (lib/!= column value)
                    :>  (lib/> column value)
                    :>= (lib/>= column value)
                    :<  (lib/< column value)
                    :<= (lib/<= column value))]
    (lib/filter query stage-number clause)))

(defmethod apply-query-step :add-boolean-filter
  [query {:keys [value], step-type :type, column-id :column_id, operator-name :operator}]
  (let [query                 (lib/ensure-filter-stage query)
        [column stage-number] (find-column-and-stage query
                                                     #(into []
                                                       (filter lib.types.isa/boolean?)
                                                       (lib/filterable-columns query %))
                                                     column-id step-type)
        operators (lib/filterable-column-operators column)
        operator  (find-operator operators operator-name step-type)
        clause    (condp = (:short operator)
                    :=  (lib/= column value))]
    (lib/filter query stage-number clause)))

(defmethod apply-query-step :add-specific-date-filter
  [query {:keys [value], step-type :type, column-id :column_id, operator-name :operator}]
  (let [query                 (lib/ensure-filter-stage query)
        [column stage-number] (find-column-and-stage query
                                                     #(into []
                                                       (filter lib.types.isa/date-or-datetime?)
                                                       (lib/filterable-columns query %))
                                                     column-id step-type)
        operators (lib/filterable-column-operators column)
        operator  (find-operator operators operator-name step-type)
        clause    (condp = (:short operator)
                    :=  (lib/= column value)
                    :>  (lib/> column value)
                    :<  (lib/< column value))]
    (lib/filter query stage-number clause)))

(defmethod apply-query-step :add-relative-date-filter
  [query {:keys [direction unit value], step-type :type, column-id :column_id}]
  (let [query                 (lib/ensure-filter-stage query)
        [column stage-number] (find-column-and-stage query
                                                     #(into []
                                                       (filter lib.types.isa/date-or-datetime?)
                                                       (lib/filterable-columns query %))
                                                     column-id step-type)
        direction (keyword direction)
        unit      (keyword unit)]
    (lib/filter query
                stage-number
                (lib/time-interval column
                                   (condp = direction
                                     :last    (- value)
                                     :current :current
                                     :next    value)
                                   unit))))

(defmethod apply-query-step :add-aggregation
  [query {step-type :type, operator-name :operator, column-id :column_id}]
  (let [[operator stage-number] (find-operator-and-stage query
                                                         #(lib/available-aggregation-operators query %)
                                                         operator-name
                                                         step-type)]
    (if (:requires-column? operator)
      (let [columns (lib/aggregation-operator-columns operator)
            column  (find-column query stage-number columns column-id step-type)]
        (lib/aggregate query stage-number (lib/aggregation-clause operator column)))
      (lib/aggregate query stage-number (lib/aggregation-clause operator)))))

(defmethod apply-query-step :add-breakout
  [query {step-type :type, column-id :column_id}]
  (let [[column stage-number] (find-column-and-stage query
                                                     #(lib/breakoutable-columns query %)
                                                     column-id
                                                     step-type)
        bucket  (m/find-first :default (lib/available-temporal-buckets query stage-number column))
        binning (m/find-first :default (lib/available-binning-strategies query stage-number column))]
    (lib/breakout query stage-number (cond-> column
                                       bucket  (lib/with-temporal-bucket bucket)
                                       binning (lib/with-binning binning)))))

(defmethod apply-query-step :add-order-by
  [query {step-type :type, column-id :column_id, direction-name :direction}]
  (let [[column stage-number] (find-column-and-stage query
                                                     #(lib/orderable-columns query %)
                                                     column-id
                                                     step-type)
        direction (when direction-name (keyword direction-name))]
    (lib/order-by query stage-number column direction)))

(defmethod apply-query-step :add-limit
  [query {:keys [limit]}]
  (if (not (neg-int? limit))
    (lib/limit query limit)
    (throw (limit-error limit))))

(defn- apply-query-steps
  [query steps]
  (reduce apply-query-step query steps))

(defn- source-query
  [source]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database_id source))
        table-or-card     (condp = (-> source :type keyword)
                                 :table (lib.metadata/table metadata-provider (:id source))
                                 :card  (lib.metadata/card metadata-provider (:id source)))]
    (lib/query metadata-provider table-or-card)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/run-query
  [_tool-name {:keys [source steps]} _context]
  (try
    {:output "success"
     :reactions [{:type  :metabot.reaction/run-query
                  :dataset_query (-> (source-query source)
                                     (apply-query-steps steps)
                                     (lib/drop-empty-stages)
                                     lib.query/->legacy-MBQL)}]}
    (catch ExceptionInfo e
      (log/debug e "Error in run-query tool")
      {:output (ex-message e)})))
