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
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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
      (log/error e "Failed to fetch metadata")
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
                            (str/join "\n" (map llm-rep/metric->xml metrics))
                            "\n</metrics>\n"))
                     (when (seq models)
                       (str "<metabase-models>\n"
                            (str/join "\n" (map llm-rep/model->xml models))
                            "\n</metabase-models>")))]
    (format-with-instructions content instructions/answer-sources-instructions)))

(defn- format-metadata-output
  [structured]
  (llm-rep/get-metadata-result->xml structured))

(defn- format-field-metadata-output
  ;; NOTE: keep in sync with read_resource.clj/format-content :field-metadata branch
  [{:keys [field_id value_metadata]}]
  (format-with-instructions
   (llm-rep/field-metadata->xml {:field_id field_id :value_metadata value_metadata})
   instructions/field-metadata-instructions))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (m/assoc-some result :output (some-> result :structured-output format-fn)))

(defn- entity-usage-on-result
  "Attach an `:entity-usage` map under `:structured-output`, preserving any
  structured-output already present. Mirrors the helper in
  `metabase.metabot.tools.transforms` / `tools.charts` — kept inline here so
  metadata tools stay self-contained."
  [result entity-usage]
  (update result :structured-output (fnil assoc {}) :entity-usage entity-usage))

(defn- list-available-fields-input
  "Build `:input` for `list_available_fields` from the tool args. One entry per
  id in each list, typed by source list."
  [{:keys [table_ids model_ids metric_ids]}]
  (into []
        (concat
         (mapv (fn [tid] {:type "table"  :id tid}) (or table_ids []))
         (mapv (fn [mid] {:type "model"  :id mid}) (or model_ids []))
         (mapv (fn [mid] {:type "metric" :id mid}) (or metric_ids [])))))

(defn- fields-from-entity
  "Project an entity's `:fields` vector to entity-usage `:output` entries.
  Skips pseudo-fields whose `:field_id` is not an integer (aggregation /
  expression columns from `lib/visible-columns` lose their backing DB field
  id; only real `metabase_field.id` references are recorded)."
  [{entity-id :id fields :fields}]
  (into []
        (comp (keep :field_id)
              (filter int?)
              (map (fn [fid] {:type "field"
                              :id   fid
                              :metadata {:table_id entity-id}})))
        fields))

(defn- list-available-fields-output
  "Walk the `get-metadata` result and collect each surfaced field. Tables
  contribute their direct fields; models contribute their `lib/returned-columns`
  (each typed with the model's card id under `:metadata.table_id` — the
  parent that surfaced the field). Metrics surface no fields under the
  options `list_available_fields` passes (`with-queryable-dimensions? false`),
  so they contribute nothing here."
  [result]
  (let [{:keys [tables models]} (:structured-output result)]
    (into []
          (mapcat fields-from-entity)
          (concat tables models))))

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
           :tool-type :inspection
           :scope     scope/agent-metadata-read}
  list-available-fields-tool
  "Retrieve metadata for tables, models, and metrics."
  [{:keys [table_ids model_ids metric_ids] :as args} :- list-available-fields-schema]
  (let [base-input (list-available-fields-input args)
        result     (add-output
                    (get-metadata {:table-ids  table_ids
                                   :model-ids  model_ids
                                   :metric-ids metric_ids})
                    format-metadata-output)]
    (entity-usage-on-result result
                            {:input  base-input
                             :output (list-available-fields-output result)})))

(def ^:private get-field-values-schema
  [:map {:closed true}
   [:data_source [:enum "table" "model" "metric"]]
   [:source_id :int]
   [:field_id [:or :int :string]]])

(mu/defn ^{:tool-name "get_field_values"
           :tool-type :inspection
           :scope     scope/agent-metadata-read}
  get-field-values-tool
  "Return metadata for a given field of a given data source."
  [{:keys [data_source source_id field_id]} :- get-field-values-schema]
  (let [entity-usage {:input  [{:type data_source :id source_id}
                               {:type "field"     :id field_id}]
                      :output []}
        result       (add-output
                      (field-stats-tools/field-values {:entity-type data_source
                                                       :entity-id   source_id
                                                       :field-id    field_id
                                                       :limit       nil})
                      format-field-metadata-output)]
    (entity-usage-on-result result entity-usage)))
