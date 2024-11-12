(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- column-display-name
  [query column]
  (->> column (lib/display-info query) :long-display-name))

(defn- operator-display-name
  [operator]
  (-> operator :short name))

(defn- find-column
  [query columns column-name]
  (m/find-first #(= (column-display-name query %) column-name) columns))

(defn- column-error
  [query columns column-name step-type]
  (ex-info (format "%s is not a correct column for the %s step. Correct columns are: %s"
                   column-name
                   step-type
                   (str/join ", " (map #(column-display-name query %) columns)))
           {:column column-name}))

(defn- find-operator
  [operators operator-name]
  (m/find-first #(= (operator-display-name %) operator-name) operators))

(defn- operator-error
  [operators operator-name step-type]
  (ex-info (format "%s is not a correct operator for the %s step. Correct operators are: %s"
                   operator-name
                   step-type
                   (str/join ", " (map operator-display-name operators)))
           {:operator operator-name}))

(defn- limit-error
  [limit]
  (ex-info "Row limit must be a non-negative number." {:limit limit}))

(defmulti apply-step
  "Applies a query step."
  {:arglists '([query step])}
  (fn [_query step]
    (-> step :type keyword)))

(defmethod apply-step :string-filter
  [query {:keys [value], step-type :type, column-name :column, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/string-or-string-like?) (lib/filterable-columns query))
        column    (or (find-column query columns column-name)
                      (throw (column-error query columns column-name step-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (operator-error operators operator-name step-type)))
        clause    (condp = (:short operator)
                    :=                (lib/= column value)
                    :!=               (lib/!= column value)
                    :contains         (lib/contains column value)
                    :does-not-contain (lib/does-not-contain column value)
                    :starts-with      (lib/starts-with column value)
                    :ends-with        (lib/ends-with column value))]
    (lib/filter query clause)))

(defmethod apply-step :number-filter
  [query {:keys [value], step-type :type, column-name :column, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/numeric?) (lib/filterable-columns query))
        column    (or (find-column query columns column-name)
                      (throw (column-error query columns column-name step-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (operator-error operators operator-name step-type)))
        clause    (condp = (:short operator)
                    :=  (lib/= column value)
                    :!= (lib/!= column value)
                    :>  (lib/> column value)
                    :>= (lib/>= column value)
                    :<  (lib/< column value)
                    :<= (lib/<= column value))]
    (lib/filter query clause)))

(defmethod apply-step :boolean-filter
  [query {:keys [value], step-type :type, column-name :column, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/boolean?) (lib/filterable-columns query))
        column    (or (find-column query columns column-name)
                      (throw (column-error query columns column-name step-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (operator-error operators operator-name step-type)))
        clause    (condp = operator
                    :=  (lib/= column value))]
    (lib/filter query clause)))

(defmethod apply-step :specific-date-filter
  [query {:keys [value], step-type :type, column-name :column, operator-name :operator}]
  (let [columns   (into [] (filter lib.types.isa/date-or-datetime?) (lib/filterable-columns query))
        column    (or (find-column query columns column-name)
                      (throw (column-error query columns column-name step-type)))
        operators (lib/filterable-column-operators column)
        operator  (or (find-operator operators operator-name)
                      (throw (operator-error operators operator-name step-type)))
        clause    (condp = (:short operator)
                    :=  (lib/= column value)
                    :>  (lib/> column value)
                    :<  (lib/< column value))]
    (lib/filter query clause)))

(defmethod apply-step :relative-date-filter
  [query {:keys [direction unit value], step-type :type, column-name :column}]
  (let [columns   (into [] (filter lib.types.isa/date-or-datetime?) (lib/filterable-columns query))
        column    (or (find-column query columns column-name)
                      (throw (column-error query columns column-name step-type)))
        direction (keyword direction)
        unit      (keyword unit)]
    (lib/filter query (lib/time-interval column
                                         (condp = direction
                                           :last    (- value)
                                           :current :current
                                           :next    value)
                                         unit))))
(defmethod apply-step :aggregation
  [query {step-type :type, operator-name :operator, column-name :column}]
  (let [operators (lib/available-aggregation-operators query)
        operator  (or (find-operator operators operator-name)
                      (throw (operator-error operators operator-name step-type)))]
    (if (:requires-column? operator)
      (let [columns (lib/aggregation-operator-columns operator)
            column  (or (find-column query columns column-name)
                        (throw (column-error query columns column-name step-type)))]
        (lib/aggregate query (lib/aggregation-clause operator column)))
      (lib/aggregate query (lib/aggregation-clause operator)))))

(defmethod apply-step :breakout
  [query {step-type :type, column-name :column}]
  (let [columns (lib/breakoutable-columns query)
        column  (or (find-column query columns column-name)
                    (throw (column-error query columns column-name step-type)))
        bucket  (m/find-first :default (lib/available-temporal-buckets query column))
        binning (m/find-first :default (lib/available-binning-strategies query column))]
    (lib/breakout query (cond-> column
                          bucket  (lib/with-temporal-bucket bucket)
                          binning (lib/with-binning binning)))))

(defmethod apply-step :order_by
  [query {step-type :type, column-name :column}]
  (let [columns (lib/orderable-columns query)
        column  (or (find-column query columns column-name)
                    (throw (column-error query columns column-name step-type)))]
    (lib/order-by query column)))

(defmethod apply-step :limit
  [query {:keys [limit]}]
  (if (not (neg-int? limit))
    (lib/limit query limit)
    (throw (limit-error limit))))

(defn- raw-query
  [query]
  (lib/query (lib.metadata/->metadata-provider query)
             (or (some->> query lib.util/source-table-id (lib.metadata/table query))
                 (some->> query lib.util/source-card-id (lib.metadata/card query)))))

(defn- apply-steps
  [query steps]
  (reduce apply-step query steps))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/run-query
  [_tool-name {:keys [steps]} {:keys [dataset_query]}]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database dataset_query))
        query             (lib/query metadata-provider dataset_query)]
    (try
      {:reactions [{:type  :metabot.reaction/run-query
                    :dataset_query (-> (raw-query query)
                                       (apply-steps steps)
                                       lib.query/->legacy-MBQL)}]
       :output "success"}
      (catch ExceptionInfo e
        (log/debug e "Error creating a query in run-query tool")
        {:output (ex-message e)}))))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/run-query
  [_tool-name {:keys [dataset_query]}]
  (some? dataset_query))
