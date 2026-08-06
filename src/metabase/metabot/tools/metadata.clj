(ns metabase.metabot.tools.metadata
  "Metadata tool wrappers."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.entity-details :as entity-details-tools]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private max-input-ids 5)
(def ^:private model-field-value-limit 20)

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
      (log/error "Failed to fetch metadata" {:id id, :error (ex-message e)})
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
                                   {:entity-type :table
                                    :entity-id table-id
                                    :with-fields? true
                                    :with-field-values? false
                                    :with-related-tables? false
                                    :with-metrics? false
                                    :with-default-temporal-breakout? false
                                    :with-measures? true
                                    :with-segments? true}))
                                %)
                              table-ids)
          model-results (mapv #(safe-fetch
                                (fn [model-id]
                                  (entity-details-tools/get-table-details
                                   {:entity-type :model
                                    :entity-id model-id
                                    :with-fields? true
                                    :with-field-values? false
                                    :with-related-tables? false
                                    :with-metrics? false
                                    :with-default-temporal-breakout? false
                                    :with-measures? true
                                    :with-segments? true}))
                                %)
                              model-ids)
          metric-results (mapv #(safe-fetch
                                 (fn [metric-id]
                                   (entity-details-tools/get-metric-details
                                    {:metric-id metric-id
                                     :with-default-temporal-breakout? false
                                     :with-field-values? false
                                     :with-queryable-dimensions? false
                                     :with-segments? true}))
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
      (log/errorf "Failed to fetch metadata: %s" (ex-message e))
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to fetch metadata: " (or (ex-message e) "Unknown error"))}))))

(defn- format-with-instructions
  [data instruction-text]
  (str "<result>\n" data "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

(defn- format-answer-sources-output
  [{:keys [metrics models]}]
  (let [content (str (when (seq metrics)
                       (str "<metrics>\n"
                            (str/join "\n" (map llm-shape/metric->xml metrics))
                            "\n</metrics>\n"))
                     (when (seq models)
                       (str "<metabase-models>\n"
                            (str/join "\n" (map llm-shape/model->xml models))
                            "\n</metabase-models>")))]
    (format-with-instructions content instructions/answer-sources-instructions)))

(defn- format-metadata-output
  [structured]
  (llm-shape/get-metadata-result->xml structured))

(defn- format-field-metadata-output
  ;; NOTE: keep in sync with read_resource.clj/format-content :field-metadata branch
  ([structured]
   (format-field-metadata-output structured nil))
  ([{:keys [field_id value_metadata portable_fk table_reference]}
    {:keys [returned-value-count shown-value-count]}]
   (let [field-xml  (llm-shape/field-metadata->xml {:field_id field_id :value_metadata value_metadata
                                                    :portable_fk portable_fk :table_reference table_reference})
         result-xml (if returned-value-count
                      (format (str "<field-metadata-result>\n%s\n"
                                   "<sample-values-summary returned-count=\"%d\" shown-count=\"%d\" "
                                   "truncated=\"true\" />\n</field-metadata-result>")
                              field-xml returned-value-count shown-value-count)
                      field-xml)]
     (format-with-instructions result-xml instructions/field-metadata-instructions))))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (m/assoc-some result :output (some-> result :structured-output format-fn)))

(defn- add-field-metadata-outputs
  "Add the full client/audit output and, for a high-cardinality field, a bounded
  model-facing output. Only the sample values are bounded: field identity,
  portable column reference, source table, statistics, and instructions remain
  in the compact XML. The original structured result is never changed."
  [result]
  (let [result      (add-output result format-field-metadata-output)
        structured  (:structured-output result)
        values      (get-in structured [:value_metadata :field_values])
        value-count (when (sequential? values) (count values))]
    (if (and value-count (> value-count model-field-value-limit))
      (let [compact (assoc-in structured
                              [:value_metadata :field_values]
                              (into [] (take model-field-value-limit) values))]
        (assoc result :model-output
               (format-field-metadata-output
                compact
                {:returned-value-count value-count
                 :shown-value-count    model-field-value-limit})))
      result)))

(mu/defn ^{:tool-name "list_available_data_sources"
           :scope     scope/agent-metadata-read}
  list-available-data-sources-tool
  "List all data sources (metrics and models) available to the metabot instance."
  [_args :- [:map {:closed true}]]
  (add-output
   (entity-details-tools/answer-sources {:metabot-id         shared/*metabot-id*
                                         :with-field-values? false
                                         :with-measures?     true
                                         :with-segments?     true})
   format-answer-sources-output))

(def ^:private list-available-fields-schema
  [:map {:closed true}
   [:table_ids [:sequential :int]]
   [:model_ids [:sequential :int]]
   [:metric_ids [:sequential :int]]])

(mu/defn ^{:tool-name "list_available_fields"
           :scope     scope/agent-metadata-read}
  list-available-fields-tool
  "Retrieve metadata for tables, models, and metrics."
  [{:keys [table_ids model_ids metric_ids]} :- list-available-fields-schema]
  (add-output
   (get-metadata {:table-ids table_ids
                  :model-ids model_ids
                  :metric-ids metric_ids})
   format-metadata-output))

(def ^:private get-field-values-schema
  [:map {:closed true}
   [:data_source [:enum "table" "model" "metric"]]
   [:source_id :int]
   [:field_id [:or :int :string]]])

(mu/defn ^{:tool-name "get_field_values"
           :scope     scope/agent-metadata-read}
  get-field-values-tool
  "Return metadata for a given field of a given data source."
  [{:keys [data_source source_id field_id]} :- get-field-values-schema]
  (add-field-metadata-outputs
   (field-stats-tools/field-values {:entity-type data_source
                                    :entity-id source_id
                                    :field-id field_id
                                    :limit nil})))
