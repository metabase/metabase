(ns metabase-enterprise.metabot-v3.agent.tools.analytics
  "Analytics tool wrappers for outlier detection."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as outlier-tools]
   [metabase-enterprise.metabot-v3.util :as metabot.u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- resolve-query-from-memory
  "Resolve a query-id from agent memory into a dataset_query."
  [query-id]
  (when-let [query (get (shared/current-queries-state) query-id)]
    query))

(defn- format-outliers-output
  "Format outlier results as XML for the agent."
  [outliers]
  (if (empty? outliers)
    "<result>No outliers detected in the data.</result>"
    (metabot.u/xml
     [:outliers {:count (count outliers)}
      (for [{:keys [dimension value]} outliers]
        [:outlier {:dimension (str dimension) :value (str value)}])])))

(mu/defn ^{:tool-name "find_outliers"}
  find-outliers-tool
  "Find outliers for a metric, or the numeric column of a query or report result.
  Use this if the user explicitly asks for outliers, unusual mins/maxes,
  whether values are within a normal range, or records that stand out in results."
  [{:keys [data_source]}
   :- [:map {:closed true}
       [:data_source [:map
                      [:query_id {:optional true} [:maybe :string]]
                      [:result_field_id {:optional true} [:maybe :string]]
                      [:report_id {:optional true} [:maybe :int]]
                      [:metric_id {:optional true} [:maybe :int]]
                      [:table_id {:optional true} [:maybe :string]]]]]]
  (try
    (let [;; If query_id is provided, resolve it from memory to an actual query
          data-source (if-let [query-id (:query_id data_source)]
                        (if-let [query (resolve-query-from-memory query-id)]
                          (-> data_source
                              (assoc :query query)
                              (dissoc :query_id))
                          (throw (ex-info (str "Query not found in memory: " query-id)
                                          {:agent-error? true :query-id query-id})))
                        data_source)
          ;; Normalize keys for the backend tool
          data-source (cond-> data-source
                        (:report_id data-source) (-> (assoc :report-id (:report_id data-source))
                                                     (dissoc :report_id))
                        (:metric_id data-source) (-> (assoc :metric-id (:metric_id data-source))
                                                     (dissoc :metric_id))
                        (:table_id data-source)  (-> (assoc :table-id (:table_id data-source))
                                                     (dissoc :table_id))
                        (:result_field_id data-source) (-> (assoc :result-field-id (:result_field_id data-source))
                                                           (dissoc :result_field_id)))
          result (outlier-tools/find-outliers {:data-source data-source})
          outliers (:structured-output result)]
      (if outliers
        {:output (format-outliers-output outliers)
         :structured-output outliers}
        result))
    (catch Exception e
      (log/error e "Error finding outliers")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to find outliers: " (or (ex-message e) "Unknown error"))}))))
