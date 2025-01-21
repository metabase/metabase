(ns metabase-enterprise.metabot-v3.tools.find-outliers
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- checked-card-dataset-query
  [card-id]
  (-> (t2/select-one [:model/Card :collection_id :dataset_query] card-id)
      api/read-check
      :dataset_query))

(defn- find-dataset-query
  [{:keys [query_id report_id metric_id] :as data-source} env]
  (cond
    metric_id [(metabot-v3.tools.u/card-field-id-prefix metric_id)
               (checked-card-dataset-query metric_id)]
    report_id (if-let [card-id (if (string? report_id)
                                 (some-> (re-matches #"card__(\d+)" report_id)
                                         second
                                         parse-long)
                                 report_id)]
                [(metabot-v3.tools.u/card-field-id-prefix card-id)
                 (checked-card-dataset-query card-id)]
                (throw (ex-info "Invalid report_id as data_source" {:agent-error? true
                                                                    :data_source data-source})))
    query_id  (if-let [query (metabot-v3.envelope/find-query env query_id)]
                (do
                  (api/read-check :model/Database (:database query))
                  [(metabot-v3.tools.u/query-field-id-prefix query_id)
                   query])
                (throw (ex-info (str "No query found with query_id " query_id) {:agent-error? true
                                                                                :data_source data-source})))
    :else     (throw (ex-info "Invalid data_source" {:agent-error? true
                                                     :data_source data-source}))))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/find-outliers
  [_tool-name {:keys [data-source]} env]
  (let [{:keys [metric_id result_field_id]} data-source]
    (try
      (let [[field-id-prefix dataset-query] (find-dataset-query data-source env)
            {:keys [data]} (u/prog1 (qp/process-query (qp/userland-query-with-default-constraints dataset-query))
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
            value-col-idx (if metric_id
                            (->> data
                                 :cols
                                 (map-indexed vector)
                                 (m/find-first (fn [[_i col]]
                                                 (lib.types.isa/numeric? (u/normalize-map col))))
                                 first)
                            (metabot-v3.tools.u/resolve-column-index result_field_id field-id-prefix))]
        {:structured-output (->> data
                                 :rows
                                 (map (fn [row]
                                        {:dimension (nth row dimension-col-idx)
                                         :value (nth row value-col-idx)}))
                                 (metabot-v3.client/find-outliers-request))})
      (catch Exception e
        (metabot-v3.tools.u/handle-agent-error e)))))
