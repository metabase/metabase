(ns metabase-enterprise.metabot-v3.tools.find-outliers
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- checked-card-dataset-query
  [card-id]
  (-> (t2/select-one [:model/Card :collection_id :dataset_query] card-id)
      api/read-check
      :dataset_query))

(defn- find-dataset-query
  [{:keys [query report-id metric-id] :as data-source}]
  (cond
    metric-id (if (int? metric-id)
                (checked-card-dataset-query metric-id)
                (throw (ex-info "Invalid metric_id as data_source" {:agent-error? true
                                                                    :data-source data-source})))
    report-id (if (int? report-id)
                (checked-card-dataset-query report-id)
                (throw (ex-info "Invalid report_id as data_source" {:agent-error? true
                                                                    :data-source data-source})))
    query     (do (api/read-check :model/Database (:database query))
                  query)
    :else     (throw (ex-info "Invalid data_source" {:agent-error? true
                                                     :data-source data-source}))))

(defn find-outliers
  "Find outliers in the values provided by `data-source` for a given column."
  [{:keys [data-source]}]
  (let [{:keys [metric-id result-field-id]} data-source]
    (try
      (let [dataset-query (find-dataset-query data-source)
            {:keys [data]} (u/prog1 (-> dataset-query
                                        (qp/userland-query-with-default-constraints {:context :ad-hoc})
                                        qp/process-query)
                             (when-not (= :completed (:status <>))
                               (throw (ex-info "Unexpected error running query" {:agent-error? true
                                                                                 :status (:status <>)}))))
            dimension-col-idx (or (->> data
                                       :cols
                                       (map-indexed vector)
                                       (m/find-first (fn [[_i col]]
                                                       (lib.types.isa/temporal? (u/normalize-map col))))
                                       first)
                                  (throw (ex-info "No temporal dimension found. Outliers can only be detected when a temporal dimension is available."
                                                  {:agent-error? true})))
            value-col-idx (if metric-id
                            (or (->> data
                                     :cols
                                     (map-indexed vector)
                                     (m/find-first (fn [[_i col]]
                                                     (lib.types.isa/numeric? (u/normalize-map col))))
                                     first)
                                (throw (ex-info "Could not determine result field."
                                                {:agent-error? true})))
                            ;; Parse field-id and extract the numeric index
                            (if-let [{:keys [field-index]} (metabot-v3.tools.u/parse-field-id result-field-id)]
                              field-index
                              (throw (ex-info (str "Invalid result_field_id format: " result-field-id)
                                              {:agent-error? true
                                               :result-field-id result-field-id}))))]
        (when-not (< -1 value-col-idx (-> data :rows first count))
          (throw (ex-info (str "Invalid result_field_id " result-field-id)
                          {:agent-error? true})))
        {:structured-output (->> data
                                 :rows
                                 (map (fn [row]
                                        {:dimension (nth row dimension-col-idx)
                                         :value (nth row value-col-idx)}))
                                 (metabot-v3.client/find-outliers-request))})
      (catch Exception e
        (metabot-v3.tools.u/handle-agent-error e)))))
