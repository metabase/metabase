(ns metabase.metabot.tools.metadata
  "Metadata tool wrappers."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-details :as entity-details-tools]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.resources :as resources-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-input-ids 5)

(tools/defrecoverable too-many-ids!
  "The call contains too many IDs for one data source type."
  {:payload [:map {:closed true}
             [:label [:enum "table" "model" "metric"]]
             [:count :int]]}
  [{:keys [label count]}]
  {:message (str "Too many " label " IDs provided (" count "). Limit each source type to "
                 max-input-ids " IDs per call.")
   :recovery [{:text "Split the IDs across multiple calls." :uses #{}}]})

(defn- validate-id-count
  [ids label]
  (when (> (count ids) max-input-ids)
    (too-many-ids! {:label label :count (count ids)})))

(def ^:private list-available-fields-schema
  [:map {:closed true}
   [:table_ids [:sequential :int]]
   [:model_ids [:sequential :int]]
   [:metric_ids [:sequential :int]]])

(defn- source-entity-type
  "Check that the current user can read `entity-id` as a Metabot resource, and return the entity type to read
  it as: `:table` for a table, or the card's own type for a card, whichever card type was requested."
  [requested-type entity-id]
  (if (= requested-type :table)
    (do (resources-tools/check-table-resource-database entity-id)
        ;; an inactive table is missing, as the details treat it, not uncurated
        (tools.u/get-table entity-id :db_id)
        :table)
    ;; Users call saved questions metrics, and `list_available_fields` has no argument for questions. A card in the
    ;; wrong list is read at its own type, and the output groups it under that type.
    (:type (resources-tools/check-card-resource-database entity-id))))

(defn- check-curated!
  "Under curated-only, throw unless the source is within curated content. `entity-type` is the type
  that `source-entity-type` returned."
  [entity-type entity-id]
  (when (shared/curated-only?)
    (curation/check-curated-subject! (str (name entity-type) " " entity-id)
                                     (case entity-type
                                       :table    ["table" entity-id]
                                       :metric   ["metric" entity-id]
                                       (:model :question) ["card" entity-id]))))

(defn- source-metadata
  [{:keys [entity-type entity-id]}]
  (let [entity-type (source-entity-type entity-type entity-id)]
    (check-curated! entity-type entity-id)
    (cond-> (if (= entity-type :metric)
              (entity-details-tools/get-metric-details
               {:metric-id entity-id
                :with-default-temporal-breakout? false
                :with-field-values? false
                :with-queryable-dimensions? false
                :with-segments? true})
              (entity-details-tools/get-table-details
               {:entity-type entity-type
                :entity-id entity-id
                :with-fields? true
                :with-field-values? false
                :with-related-tables? false
                :with-metrics? false
                :with-default-temporal-breakout? false
                :with-measures? true
                :with-segments? true}))
      ;; under curated-only a card's details omit its definition, as read_resource's do
      (shared/curated-only?) (update :structured-output dissoc :query_json))))

(defn- metadata-fault-entry
  [{:keys [entity-type entity-id] :as item} e]
  (log/error e "Failed to fetch metadata" item)
  {:item item :failed? true
   :output (str "Could not load metadata for " (name entity-type) " " entity-id
                ". Continue with another data source.")})

(defrecord MetadataSourceTool []
  tools/Tool
  (declaration [_]
    {:name "list_available_fields"
     :description "Retrieve metadata for a table, model, or metric."
     :scope scope/agent-metadata-read
     :args [:map {:closed true}
            [:entity-type [:enum :table :model :metric]]
            [:entity-id :int]]})
  (handle [_ {:keys [entity-type entity-id] :as item} _ctx]
    (tools/with-entity {:kind entity-type :id entity-id}
      (let [result (source-metadata item)]
        (if-let [structured (:structured-output result)]
          {:output "" :structured-output structured}
          (if (contains? tools/refusal-status-codes (:status-code result))
            (recoverable.common/not-found! {:kind entity-type :id entity-id})
            (throw (ex-info "No metadata returned for data source" item)))))))
  tools/BatchedTool
  (batched-declaration [_ declaration]
    (assoc declaration
           :description (str "Retrieve metadata for up to 5 tables, 5 models, and 5 metrics per call. "
                             "A saved question ID can go in `model_ids` or `metric_ids`.")
           :args list-available-fields-schema))
  (batched-args [_ {table-ids :table_ids model-ids :model_ids metric-ids :metric_ids}]
    (into []
          (mapcat (fn [[kind ids]]
                    (validate-id-count ids (name kind))
                    (map (fn [id] {:entity-type kind :entity-id id}) ids)))
          [[:table table-ids] [:model model-ids] [:metric metric-ids]]))
  (compose [_ entries _ctx]
    (let [metadata (reduce (fn [metadata {:keys [failed? output structured-output]}]
                             (if failed?
                               (update metadata :errors conj output)
                               (update metadata (case (:type structured-output)
                                                  :table :tables
                                                  :model :models
                                                  :metric :metrics
                                                  :question :questions)
                                       conj structured-output)))
                           {:result-type :metadata :tables [] :models [] :metrics [] :questions [] :errors []}
                           entries)]
      {:output (llm-shape/get-metadata-result->xml metadata)
       :structured-output metadata})))

(def ^:private metadata-source-tool (->MetadataSourceTool))

(defn- format-with-instructions
  [data instruction-text]
  (str "<result>\n" data "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

;; Every later request of the turn sends the list again, so a long list can pass the model's context window or the
;; provider's request size limit.
(def ^:private max-answer-sources
  "The most entries that `list_available_data_sources` lists."
  50)

(defn- collection-browse-uris
  "The `read_resource` URIs, each with what it gives, that find the data sources in the collection `collection-id`."
  [collection-id]
  [(str (llm-shape/metabase-uri :collection collection-id "items")
        " (the metrics, models and subcollections of the Metabot's collection)")])

(defn- instance-browse-uris
  "The `read_resource` URIs, each with what it gives, that find the data sources of a Metabot with no collection."
  [database-ids]
  ;; The collection URIs list the default namespace only. The table URIs also reach the metrics and models in other
  ;; namespaces, for example shared tenant collections.
  (concat ["metabase://collection/root/items (the metrics, models and subcollections of the root collection)"
           (str "metabase://databases, then metabase://database/{id}/tables, then metabase://table/{id}/derived "
                "(the metrics and models built on a table, in any collection)")]
          (map #(str (llm-shape/metabase-uri :database % "models") " (the models of database " % ")")
               database-ids)))

(defn- more-answer-sources-note
  "A note that the scope holds more data sources than the list shows, with the URIs that `read_resource` can
  browse."
  [{:keys [collection_id database_ids]}]
  (let [uris (if collection_id
               (collection-browse-uris collection_id)
               (instance-browse-uris database_ids))]
    (str "<more-data-sources>\n"
         "This list does not show all data sources. More data sources exist. "
         "To find them, call `read_resource` with one of these URIs:\n"
         (str/join "\n" (map #(str "- " %) uris)) "\n"
         "</more-data-sources>")))

(defn- short-answer-source
  "The keys of a model or metric that one entry of `list_available_data_sources` shows."
  [source]
  (select-keys source [:id :type :name :description :verified :database_id :portable_entity_id
                       :source_unavailable]))

(defn- format-answer-sources-output
  [{:keys [metrics models more?] :as sources}]
  (let [content (str (when (seq metrics)
                       (str "<metrics>\n"
                            (str/join "\n" (map llm-shape/data-source-entry->xml metrics))
                            "\n</metrics>\n"))
                     (when (seq models)
                       (str "<metabase-models>\n"
                            (str/join "\n" (map llm-shape/data-source-entry->xml models))
                            "\n</metabase-models>\n"))
                     (when more?
                       (more-answer-sources-note sources)))]
    (format-with-instructions content instructions/answer-sources-instructions)))

(defn- format-field-metadata-output
  ;; NOTE: keep in sync with read_resource.clj/format-content :field-metadata branch
  [{:keys [field_id value_metadata portable_fk reference reference_name source_table table_reference]}]
  (format-with-instructions
   (llm-shape/field-metadata->xml {:field_id field_id :value_metadata value_metadata
                                   :portable_fk portable_fk :reference reference :reference_name reference_name
                                   :source_table source_table :table_reference table_reference})
   instructions/field-metadata-instructions))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (m/assoc-some result :output (some-> result :structured-output format-fn)))

(tools/defrecoverable unknown-metabot!
  "The call does not identify a Metabot."
  {:payload [:map {:closed true}]}
  [_]
  {:message "No Metabot was provided for this call."
   :recovery [{:text "Ask the user to reopen the document and try again." :uses #{}}]})

(defrecord ListAvailableDataSourcesTool []
  tools/Tool
  (declaration [_]
    {:name "list_available_data_sources"
     :description (str "List up to " max-answer-sources " data sources (metrics and models) available to the "
                       "metabot instance, curated first. Each entry holds the id, name, description and database. "
                       "Call `list_available_fields` to get the columns of a model. Call `read_resource` with "
                       "`metabase://metric/{id}/dimensions` to get the dimensions of a metric.")
     :scope scope/agent-metadata-read
     :args [:map {:closed true}]})
  (handle [_ _args {:keys [metabot]}]
    (when-not (:id metabot)
      (unknown-metabot! {}))
    (add-output
     (update (entity-details-tools/answer-sources {:metabot            metabot
                                                   :limit              max-answer-sources
                                                   :with-field-values? false})
             :structured-output
             (fn [sources]
               (-> sources
                   (update :metrics #(mapv short-answer-source %))
                   (update :models #(mapv short-answer-source %)))))
     format-answer-sources-output)))

(def list-available-data-sources-tool
  "The `list_available_data_sources` tool."
  (->ListAvailableDataSourcesTool))

(defrecord ListAvailableFieldsTool []
  tools/Tool
  (declaration [_]
    (tools/batched-declaration metadata-source-tool (tools/declaration metadata-source-tool)))
  (handle [_ args ctx]
    (tools/with-batched-entries metadata-source-tool args ctx {:on-item-fault metadata-fault-entry}
      (fn [entries]
        (let [result (tools/compose metadata-source-tool entries ctx)]
          (when (and (seq entries) (every? :failed? entries))
            (tools/all-items-failed! {:count (count entries) :output (:output result)}))
          result)))))

(def list-available-fields-tool
  "The `list_available_fields` tool."
  (->ListAvailableFieldsTool))

(def ^:private get-field-values-schema
  [:map {:closed true}
   [:data_source [:enum "table" "model" "metric" "question" "report"]]
   [:source_id :int]
   [:field_id [:or :string :int]]])

(defrecord GetFieldValuesTool []
  tools/Tool
  (declaration [_]
    {:name "get_field_values"
     :description "Return metadata for a given field of a given data source."
     :scope scope/agent-metadata-read
     :args get-field-values-schema})
  (handle [_ {data-source :data_source source-id :source_id field-id :field_id} _ctx]
    (let [kind        (if (= data-source "report") :question (keyword data-source))
          entity-type (tools/with-entity {:kind kind :id source-id}
                        (source-entity-type kind source-id))]
      (check-curated! entity-type source-id)
      (tools/with-entity {:kind :field :id field-id}
        (add-output (field-stats-tools/field-values {:entity-type (name entity-type)
                                                     :entity-id source-id
                                                     :field-id field-id
                                                     :limit nil})
                    format-field-metadata-output)))))

(def get-field-values-tool
  "The `get_field_values` tool."
  (->GetFieldValuesTool))
