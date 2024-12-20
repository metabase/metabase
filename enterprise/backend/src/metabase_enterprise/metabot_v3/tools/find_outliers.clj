(ns metabase-enterprise.metabot-v3.tools.find-outliers
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.common :as api]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/find-outliers
  [_tool-name {{:keys [query_id
                       report_id
                       metric_id
                       result_field_id]}
               :data-source} _env]
  (when (or query_id report_id result_field_id)
    (throw (ex-info "Not implemented" {})))
  (let [{:keys [dataset_query]} (api/read-check (t2/select-one [:model/Card :collection_id :dataset_query] metric_id))
        {:keys [data status]} (qp/process-query (qp/userland-query dataset_query))]
    (when-not (= :completed status)
      (throw (ex-info "Unexpected error running query" {:status status})))
    (let [dimension-col-idx (->> data
                                 :cols
                                 (map-indexed vector)
                                 (m/find-first (fn [[_i col]]
                                                 (lib.types.isa/temporal? (u/normalize-map col))))
                                 first)
          _ (or dimension-col-idx (throw (ex-info "No temporal dimension found. Outliers can only be detected when a temporal dimension is available." {})))
          value-col-idx (->> data
                             :cols
                             (map-indexed vector)
                             (m/find-first (fn [[_i col]]
                                             (lib.types.isa/numeric? (u/normalize-map col))))
                             first)]
      {:output (->> data
                    :rows
                    (map (fn [row]
                           {:dimension (nth row dimension-col-idx)
                            :value (nth row value-col-idx)}))
                    (metabot-v3.client/find-outliers-request))})))
