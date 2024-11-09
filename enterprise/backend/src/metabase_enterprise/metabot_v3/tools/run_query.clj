(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.util.malli :as mu])
  (:import
    (clojure.lang ExceptionInfo)))

(defmulti apply-step
  "Applies a query step."
  {:arglists '([query step])}
  (fn [_query step]
    (-> step :type keyword)))

(defmethod apply-step :limit
  [query {:keys [limit]}]
  (if (not (neg-int? limit))
    (lib/limit query limit)
    (throw (ex-info "Row limit must be a non-negative number." {:limit limit}))))

(defn- column-display-name
  [query column]
  (:long-display-name (lib/display-info query column)))

(defmethod apply-step :order_by
  [query {:keys [column_name]}]
  (let [columns (lib/orderable-columns query)
        column  (m/find-first #(= (column-display-name query %) column_name) columns)]
    (if (some? column)
      (lib/order-by query column)
      (throw (ex-info (format "%s is not a correct column_name for the order_by step. Correct column names are: %s"
                              column_name
                              (str/join ", " (map #(column-display-name query %) columns)))
                      {:column-name column_name})))))

(defn- apply-steps
  [query steps]
  (reduce apply-step query steps))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/run-query
  [_tool-name {:keys [steps]} {:keys [dataset_query]}]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database dataset_query))
        query             (lib/query metadata-provider dataset_query)]
    (try
      {:reactions [{:type  :metabot.reaction/run-query
                    :query (-> query
                               (apply-steps steps)
                               lib.query/->legacy-MBQL)}]
       :output "success"}
      (catch ExceptionInfo e
        {:output (ex-message e)}))))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/run-query
  [_tool-name {:keys [dataset_query]}]
  (some? dataset_query))
