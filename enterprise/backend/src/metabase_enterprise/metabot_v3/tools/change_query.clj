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
  (ex-info (format "%s is not a correct column_id for the %s change. Available columns as JSON: %s"
                   column-id
                   change-type
                   (json/generate-string (mapv #(metabot-v3.tools.query/column-info query %) columns)))
           {:column column-id}))

(defn- find-operator
  [operators operator-name]
  (m/find-first #(= (metabot-v3.tools.query/operator-name %) operator-name) operators))

(defn- find-operator-error
  [operators operator-name change-type]
  (ex-info (format "%s is not a correct operator for the %s change. Available operators as JSON: %s"
                   operator-name
                   change-type
                   (json/generate-string (mapv metabot-v3.tools.query/operator-name operators)))
           {:operator operator-name}))

(defn- limit-error
  [limit]
  (ex-info "Row limit must be a non-negative number." {:limit limit}))

(defmulti apply-query-change
  "Applies a change to the query."
  {:arglists '([query change])}
  (fn [_query change]
    (-> change :type keyword)))

(defmethod apply-query-change :add-string-filter
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

(defmethod apply-query-change :add-number-filter
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

(defmethod apply-query-change :add-boolean-filter
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

(defmethod apply-query-change :add-specific-date-filter
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

(defmethod apply-query-change :add-relative-date-filter
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

(defmethod apply-query-change :add-aggregation
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

(defmethod apply-query-change :add-breakout
  [query {change-type :type, column-id :column_id}]
  (let [columns (lib/breakoutable-columns query)
        column  (or (find-column columns column-id)
                    (throw (find-column-error query columns column-id change-type)))
        bucket  (m/find-first :default (lib/available-temporal-buckets query column))
        binning (m/find-first :default (lib/available-binning-strategies query column))]
    (lib/breakout query (cond-> column
                          bucket  (lib/with-temporal-bucket bucket)
                          binning (lib/with-binning binning)))))

(defmethod apply-query-change :remove-breakout
  [query {breakout-position :breakout_position}]
  (let [breakouts (lib/breakouts query)
        breakout  (get breakouts breakout-position)]
    (lib/remove-clause query breakout)))

(defmethod apply-query-change :add-order-by
  [query {change-type :type, column-id :column_id, direction-name :direction}]
  (let [columns   (lib/orderable-columns query)
        column    (or (find-column columns column-id)
                      (throw (find-column-error query columns column-id change-type)))
        direction (when direction-name (keyword direction-name))]
    (lib/order-by query column direction)))

(defmethod apply-query-change :add-limit
  [query {:keys [limit]}]
  (if (not (neg-int? limit))
    (lib/limit query limit)
    (throw (limit-error limit))))

(defn- apply-query-changes
  [query changes]
  (reduce apply-query-change query changes))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-query
  [_tool-name {:keys [changes]} {dataset-query :dataset_query}]
  (try
    {:output "success"
     :reactions [{:type  :metabot.reaction/run-query
                  :dataset_query (-> (metabot-v3.tools.query/source-query dataset-query)
                                     (apply-query-changes changes)
                                     lib.query/->legacy-MBQL)}]}
    (catch ExceptionInfo e
      (log/debug e "Error in change-query tool")
      {:output (ex-message e)})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-query
  [_tool-name {dataset-query :dataset_query}]
  (some? dataset-query))
