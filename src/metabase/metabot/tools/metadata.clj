(ns metabase.metabot.tools.metadata
  "Metadata tool wrappers."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.entity-details :as entity-details-tools]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-input-ids 20)

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
  [{:keys [field_id value_metadata]}]
  (format-with-instructions
   (llm-shape/field-metadata->xml {:field_id field_id :value_metadata value_metadata})
   instructions/field-metadata-instructions))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (m/assoc-some result :output (some-> result :structured-output format-fn)))

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
  (add-output
   (field-stats-tools/field-values {:entity-type data_source
                                    :entity-id source_id
                                    :field-id field_id
                                    :limit nil})
   format-field-metadata-output))

;;; get_database_schema — used only when the conversation is scoped to a single
;;; database. The active database id is read from `shared/*scoped-database-id*`,
;;; so the LLM doesn't need to pass it (and can't change it). Returns just the
;;; table list — the agent should call `list_available_fields` to dig into
;;; specific tables.

(def ^:private get-database-schema-schema
  [:map {:closed true}])

(defn- format-table-line
  [{:keys [id name display_name description schema]}]
  (let [qualified  (if (str/blank? schema) name (str schema "." name))
        nice-name  (when (and display_name (not= display_name name))
                     display_name)
        desc       (some-> description str/trim not-empty)
        suffix     (cond
                     (and nice-name desc) (str " — " nice-name ": " desc)
                     nice-name            (str " — " nice-name)
                     desc                 (str " — " desc)
                     :else                "")]
    (str "- [" id "] " qualified suffix)))

(defn- format-database-schema-markdown
  [database tables]
  (let [by-schema (group-by (fn [t] (or (not-empty (:schema t)) "")) tables)
        sections  (for [[schema schema-tables] (sort-by key by-schema)]
                    (let [header (if (str/blank? schema)
                                   "## (no schema)"
                                   (str "## " schema))
                          lines  (map format-table-line
                                      (sort-by :name schema-tables))]
                      (str header "\n" (str/join "\n" lines))))]
    (str "# " (:name database) "\n\n"
         "Tables in this database. Each line is `- [table_id] schema.name — description`. "
         "Call `list_available_fields` with the table_id(s) you want to inspect to see columns.\n\n"
         (str/join "\n\n" sections))))

(mu/defn ^{:tool-name "get_database_schema"
           :scope     scope/agent-metadata-read}
  get-database-schema-tool
  "Return the list of tables in the database the conversation is scoped to. Use `list_available_fields` to get columns."
  [_args :- get-database-schema-schema]
  (try
    (let [db-id shared/*scoped-database-id*]
      (when-not db-id
        (throw (ex-info (tru "No database is currently scoped for this conversation.")
                        {:agent-error? true})))
      (api/read-check :model/Database db-id)
      (let [database (t2/select-one [:model/Database :id :name :engine] :id db-id)
            tables   (->> (t2/select [:model/Table :id :name :display_name :schema :db_id
                                      :description :active :visibility_type]
                                     :db_id db-id
                                     :active true
                                     {:order-by [[:%lower.schema :asc]
                                                 [:%lower.name :asc]]})
                          (filter #(nil? (:visibility_type %)))
                          (filter mi/can-read?))]
        {:output (format-database-schema-markdown database tables)}))
    (catch Exception e
      (log/error e "Failed to fetch database schema" {:db-id shared/*scoped-database-id*})
      {:output (or (ex-message e) "Failed to fetch database schema")})))
