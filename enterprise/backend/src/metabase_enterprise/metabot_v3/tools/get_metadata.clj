(ns metabase-enterprise.metabot-v3.tools.get-metadata
  "Tool for retrieving metadata for tables, models, and metrics."
  (:require
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-input-ids 5)

(defn- validate-id-count
  [ids label]
  (when (> (count ids) max-input-ids)
    (throw (ex-info (tru "Too many {0} IDs provided ({1}). Limit to {2}."
                         label (count ids) max-input-ids)
                    {:agent-error? true
                     :label label
                     :count (count ids)}))))

(defn- safe-fetch
  [fetch-fn id]
  (try
    (let [result (fetch-fn id)
          structured (:structured-output result)
          output (:output result)]
      (if structured
        {:value structured}
        {:error (or output (str "No metadata returned for ID " id))}))
    (catch Exception e
      (log/error e "Failed to fetch metadata" {:id id})
      {:error (or (ex-message e) (str "Failed to fetch metadata for ID " id))})))

(defn get-metadata
  "Fetch metadata for tables, models, and metrics.

  Returns:
  {:structured-output {:tables [...] :models [...] :metrics [...] :errors [...]}}"
  [{:keys [table-ids model-ids metric-ids]}]
  (try
    (doseq [[ids label] [[table-ids "table"] [model-ids "model"] [metric-ids "metric"]]]
      (validate-id-count ids label))
    (let [table-results (mapv #(safe-fetch
                                (fn [table-id]
                                  (entity-details-tools/get-table-details
                                   {:table-id table-id
                                    :with-fields? true
                                    :with-field-values? false
                                    :with-related-tables? false
                                    :with-metrics? false
                                    :with-default-temporal-breakout? false
                                    :with-measures? false
                                    :with-segments? false}))
                                %)
                              table-ids)
          model-results (mapv #(safe-fetch
                                (fn [model-id]
                                  (entity-details-tools/get-table-details
                                   {:model-id model-id
                                    :with-fields? true
                                    :with-field-values? false
                                    :with-related-tables? false
                                    :with-metrics? false
                                    :with-default-temporal-breakout? false
                                    :with-measures? false
                                    :with-segments? false}))
                                %)
                              model-ids)
          metric-results (mapv #(safe-fetch
                                 (fn [metric-id]
                                   (entity-details-tools/get-metric-details
                                    {:metric-id metric-id
                                     :with-default-temporal-breakout? false
                                     :with-field-values? false
                                     :with-queryable-dimensions? false
                                     :with-segments? false}))
                                 %)
                               metric-ids)
          tables (->> table-results (keep :value) vec)
          models (->> model-results (keep :value) vec)
          metrics (->> metric-results (keep :value) vec)
          errors (->> (concat table-results model-results metric-results)
                      (keep :error)
                      vec)]
      {:structured-output {:result-type :metadata
                           :tables tables
                           :models models
                           :metrics metrics
                           :errors errors}})
    (catch Exception e
      (log/error e "Failed to fetch metadata")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to fetch metadata: " (or (ex-message e) "Unknown error"))}))))
