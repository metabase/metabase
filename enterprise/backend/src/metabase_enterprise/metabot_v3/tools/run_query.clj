(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu])
  (:import
    (clojure.lang ExceptionInfo)))

(defmulti apply-step
  "Applies a query step."
  {:arglists '([query step])}
  (fn [_query step]
    (-> step :type keyword)))

(defn- column-display-name
  [query column]
  (->> column (lib/display-info query) :long-display-name))

(defn- operator-display-name
  [operator]
  (-> operator :short name))

(defmethod apply-step :string-filter
  [query {column-name :column operator-name :operator value :value}]
  (let [columns (lib/filterable-columns query)
        column  (m/find-first #(= (column-display-name query %) column-name) columns)]
    (if (some? column)
      (let [operators (lib/filterable-column-operators column)
            operator  (m/find-first #(= (operator-display-name %) operator-name) operators)]
        (if (some? operator)
          (->> (condp = (:short operator)
                 :=                (lib/= column value)
                 :!=               (lib/!= column value)
                 :contains         (lib/contains column value)
                 :does-not-contain (lib/does-not-contain column value)
                 :starts-with      (lib/starts-with column value)
                 :ends-with        (lib/ends-with column value))
               (lib/filter query))
          (throw (ex-info (format "%s is not a correct filter operator for %s column. Correct operators are: %s"
                                  operator-name
                                  column-name
                                  (str/join ", " (map operator-display-name operators)))
                          {:column   column-name
                           :operator operator-name}))))
      (throw (ex-info (format "%s is not a correct column for the string filter step. Correct columns are: %s"
                              column-name
                              (str/join ", " (map #(column-display-name query %) columns)))
                      {:column column-name})))))

(defmethod apply-step :aggregation
  [query {operator-name :operator, column-name :column}]
  (let [operators (lib/available-aggregation-operators query)
        operator  (m/find-first #(= (operator-display-name %) operator-name) operators)]
    (if (some? operator)
      (if (:requires-column? operator)
        (let [columns (lib/aggregation-operator-columns operator)
              column  (m/find-first #(= (column-display-name query %) column-name) columns)]
          (if (some? column)
            (lib/aggregate query (lib/aggregation-clause operator column))
            (throw (ex-info (format "%s is not a correct column for %s operator the aggregate step. Correct columns are: %s"
                                    column-name
                                    operator-name
                                    (str/join ", " (map #(column-display-name query %) columns)))
                            {:operator operator-name
                             :column   column-name}))))
        (lib/aggregate query (lib/aggregation-clause operator)))
      (throw (ex-info (format "%s is not a correct operator for the aggregation step. Correct operators are: %s"
                              operator-name
                              (str/join ", " (map operator-display-name operators)))
                      {:operator operator-name})))))

(defmethod apply-step :breakout
  [query {column-name :column}]
  (let [columns (lib/breakoutable-columns query)
        column  (m/find-first #(= (column-display-name query %) column-name) columns)]
    (if (some? column)
      (let [bucket  (m/find-first :default (lib/available-temporal-buckets query column))
            binning (m/find-first :default (lib/available-binning-strategies query column))]
        (lib/breakout query (cond-> column
                              bucket  (lib/with-temporal-bucket bucket)
                              binning (lib/with-binning binning))))
      (throw (ex-info (format "%s is not a correct column for the breakout step. Correct columns are: %s"
                              column-name
                              (str/join ", " (map #(column-display-name query %) columns)))
                      {:column column-name})))))

(defmethod apply-step :order_by
  [query {column-name :column}]
  (let [columns (lib/orderable-columns query)
        column  (m/find-first #(= (column-display-name query %) column-name) columns)]
    (if (some? column)
      (lib/order-by query column)
      (throw (ex-info (format "%s is not a correct column for the order_by step. Choose a column based on the user input from this list: %s"
                              column-name
                              (str/join ", " (map #(column-display-name query %) columns)))
                      {:column column-name})))))

(defmethod apply-step :limit
  [query {:keys [limit]}]
  (if (not (neg-int? limit))
    (lib/limit query limit)
    (throw (ex-info "Row limit must be a non-negative number." {:limit limit}))))

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
                    :query (-> (raw-query query)
                               (apply-steps steps)
                               lib.query/->legacy-MBQL)}]
       :output "success"}
      (catch ExceptionInfo e
        {:output (ex-message e)}))))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/run-query
  [_tool-name {:keys [dataset_query]}]
  (some? dataset_query))
