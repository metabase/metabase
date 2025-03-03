(ns metabase-enterprise.metabot-v3.tools.find-outliers
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
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
  [{:keys [query query_id report_id metric_id] :as data-source} env]
  (letfn [(handle-query [query query_id]
            (api/read-check :model/Database (:database query))
            [(if query_id
               (metabot-v3.tools.u/query-field-id-prefix query_id)
               metabot-v3.tools.u/any-prefix-pattern)
             query])]
    (cond
      metric_id (if (int? metric_id)
                  [(metabot-v3.tools.u/card-field-id-prefix metric_id)
                   (checked-card-dataset-query metric_id)]
                  (throw (ex-info "Invalid metric_id as data_source" {:agent-error? true
                                                                      :data_source data-source})))
      report_id (if (int? report_id)
                  [(metabot-v3.tools.u/card-field-id-prefix report_id)
                   (checked-card-dataset-query report_id)]
                  (throw (ex-info "Invalid report_id as data_source" {:agent-error? true
                                                                      :data_source data-source})))
      query     (handle-query query query_id)
      query_id  (if-let [query (metabot-v3.envelope/find-query env query_id)]
                  (handle-query query query_id)
                  (throw (ex-info (str "No query found with query_id " query_id) {:agent-error? true
                                                                                  :data_source data-source})))
      :else     (throw (ex-info "Invalid data_source" {:agent-error? true
                                                       :data_source data-source})))))

(defn find-outliers
  "Find outliers in the values provided by `data-source` for a given column."
  ([arguments]
   (find-outliers arguments nil))
  ([{:keys [data-source]} env]
   (let [{:keys [metric_id result_field_id]} data-source]
     (try
       (let [[field-id-prefix dataset-query] (find-dataset-query data-source env)
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
             value-col-idx (if metric_id
                             (or (->> data
                                      :cols
                                      (map-indexed vector)
                                      (m/find-first (fn [[_i col]]
                                                      (lib.types.isa/numeric? (u/normalize-map col))))
                                      first)
                                 (throw (ex-info "Could not determine result field."
                                                 {:agent-error? true})))
                             (metabot-v3.tools.u/resolve-column-index result_field_id field-id-prefix))]
         (when-not (< -1 value-col-idx (-> data :rows first count))
           (throw (ex-info (str "Invalid result_field_id " result_field_id)
                           {:agent-error? true})))
         {:structured-output (->> data
                                  :rows
                                  (map (fn [row]
                                         {:dimension (nth row dimension-col-idx)
                                          :value (nth row value-col-idx)}))
                                  (metabot-v3.client/find-outliers-request))})
       (catch Exception e
         (metabot-v3.tools.u/handle-agent-error e))))))
