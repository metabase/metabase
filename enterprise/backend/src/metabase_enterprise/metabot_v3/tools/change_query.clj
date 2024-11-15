(ns metabase-enterprise.metabot-v3.tools.change-query
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.query :as metabot-v3.tools.query]
   [metabase.lib.core :as lib]
   [metabase.lib.query :as lib.query]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- find-column
  [columns column-id]
  (m/find-first #(= (metabot-v3.tools.query/column-id %) column-id) columns))

(defn- find-column-error
  [query columns column-id change-type]
  (ex-info (format "%s is not a correct column_id for %s change. Available columns as JSON: %s"
                   column-id
                   change-type
                   (json/generate-string (mapv #(metabot-v3.tools.query/column-info query %) columns)))
           {:column column-id}))

(defn- find-operator
  [operators operator-name]
  (m/find-first #(= (metabot-v3.tools.query/operator-name %) operator-name) operators))

(defn- find-operator-error
  [operators operator-name change-type]
  (ex-info (format "%s is not a correct operator for %s change. Available operators as JSON: %s"
                   operator-name
                   change-type
                   (json/generate-string (mapv metabot-v3.tools.query/operator-name operators)))
           {:operator operator-name}))

(defn- find-clause-error
  [clause-position change-type]
  (ex-info (format "%s is not a valid index for %s change."
                   clause-position
                   change-type)
           {:clause-position clause-position}))

(defn- limit-error
  [limit]
  (ex-info "Row limit must be a non-negative number." {:limit limit}))

(defmulti apply-query-change
  "Applies a change to the query."
  {:arglists '([query change])}
  (fn [_query change]
    (-> change :type keyword)))

(defmethod apply-query-change :add_string_filter
  [query {:keys [value], change-type :type, column-id :column_id, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/string-or-string-like?) (lib/filterable-columns query))
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (find-operator-error operators operator-name change-type)))
        clause    (condp = (:short operator)
                    :=                (lib/= column value)
                    :!=               (lib/!= column value)
                    :contains         (lib/contains column value)
                    :does-not-contain (lib/does-not-contain column value)
                    :starts-with      (lib/starts-with column value)
                    :ends-with        (lib/ends-with column value))]
    (lib/filter query clause)))

(defmethod apply-query-change :add_number_filter
  [query {:keys [value], change-type :type, column-id :column_id, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/numeric?) (lib/filterable-columns query))
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (find-operator-error operators operator-name change-type)))
        clause    (condp = (:short operator)
                    :=  (lib/= column value)
                    :!= (lib/!= column value)
                    :>  (lib/> column value)
                    :>= (lib/>= column value)
                    :<  (lib/< column value)
                    :<= (lib/<= column value))]
    (lib/filter query clause)))

(defmethod apply-query-change :add_boolean_filter
  [query {:keys [value], change-type :type, column-id :column_id, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/boolean?) (lib/filterable-columns query))
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (find-operator-error operators operator-name change-type)))
        clause    (condp = (:short operator)
                    :=  (lib/= column value))]
    (lib/filter query clause)))

(defmethod apply-query-change :add_specific_date_filter
  [query {:keys [value], change-type :type, column-id :column_id, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/date-or-datetime?) (lib/filterable-columns query))
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (find-operator-error operators operator-name change-type)))
        clause    (condp = (:short operator)
                    :=  (lib/= column value)
                    :>  (lib/> column value)
                    :<  (lib/< column value))]
    (lib/filter query clause)))

(defmethod apply-query-change :add_relative_date_filter
  [query {:keys [direction unit value], change-type :type, column-id :column_id}]
  (let [columns   (into [] (filter lib.types.isa/date-or-datetime?) (lib/filterable-columns query))
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        direction (keyword direction)
        unit      (keyword unit)]
    (lib/filter query (lib/time-interval column
                                         (condp = direction
                                           :last    (- value)
                                           :current :current
                                           :next    value)
                                         unit))))

(defmethod apply-query-change :remove_filter
  [query {change-type :type, filter-position :filter_position}]
  (let [filters (lib/filters query)
        filter  (or (get filters filter-position)
                    (throw (find-clause-error filter-position change-type)))]
    (lib/remove-clause query filter)))

(defmethod apply-query-change :add_aggregation
  [query {change-type :type, operator-name :operator, column-id :column_id}]
  (let [operators (lib/available-aggregation-operators query)
        operator  (or (find-operator operators operator-name)
                      (throw (find-operator-error operators operator-name change-type)))]
    (if (:requires-column? operator)
      (let [columns (lib/aggregation-operator-columns operator)
            column  (or (find-column columns column-id)
                        (throw (find-column-error query columns column-id change-type)))]
        (lib/aggregate query (lib/aggregation-clause operator column)))
      (lib/aggregate query (lib/aggregation-clause operator)))))

(defmethod apply-query-change :remove_aggregation
  [query {change-type :type, aggregation-position :aggregation_position}]
  (let [aggregations (lib/aggregations query)
        aggregation  (or (get aggregations aggregation-position)
                         (throw (find-clause-error aggregation-position change-type)))]
    (lib/remove-clause query aggregation)))

(defmethod apply-query-change :add_breakout
  [query {change-type :type, column-id :column_id}]
  (let [columns (lib/breakoutable-columns query)
        column  (or (find-column columns column-id)
                    (throw (find-column-error query columns column-id change-type)))
        bucket  (m/find-first :default (lib/available-temporal-buckets query column))
        binning (m/find-first :default (lib/available-binning-strategies query column))]
    (lib/breakout query (cond-> column
                          bucket  (lib/with-temporal-bucket bucket)
                          binning (lib/with-binning binning)))))

(defmethod apply-query-change :remove_breakout
  [query {change-type :type, breakout-position :breakout_position}]
  (let [breakouts (lib/breakouts query)
        breakout  (or (get breakouts breakout-position)
                      (throw (find-clause-error breakout-position change-type)))]
    (lib/remove-clause query breakout)))

(defmethod apply-query-change :add_order_by
  [query {change-type :type, column-id :column_id, direction-name :direction}]
  (let [columns   (lib/orderable-columns query)
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        direction (when direction-name (keyword direction-name))]
    (lib/order-by query column direction)))

(defmethod apply-query-change :remove_order_by
  [query {change-type :type, order-by-position :order_by_position}]
  (let [order-bys (lib/order-bys query)
        order-by  (or (get order-bys order-by-position)
                      (throw (find-clause-error order-by-position change-type)))]
    (lib/remove-clause query order-by)))

(defmethod apply-query-change :add_limit
  [query {:keys [limit]}]
  (if (not (neg-int? limit))
    (lib/limit query limit)
    (throw (limit-error limit))))

(defmethod apply-query-change :remove_limit
  [query _change]
  (lib/limit query nil))

(defn- apply-query-changes
  [query changes]
  (reduce apply-query-change query changes))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-query
  [_tool-name {:keys [changes]} {:keys [dataset_query]}]
  (try
    {:output "success"
     :reactions [{:type  :metabot.reaction/change-query
                  :dataset_query (-> (metabot-v3.tools.query/source-query dataset_query)
                                     (apply-query-changes changes)
                                     lib.query/->legacy-MBQL)}]}
    (catch ExceptionInfo e
      (log/debug e "Error in change-query tool")
      {:output (ex-message e)})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-query
  [_tool-name {:keys [dataset_query]}]
  (some? dataset_query))
