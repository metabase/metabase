(ns metabase.metabot.tools.metadata
  "Metadata tool wrappers."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-details :as entity-details-tools]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.resources :as resources-tools]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-input-ids 5)

(tools/defrecoverable too-many-ids!
  "A metadata call exceeds the per-source-type ID limit."
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

(defn- source-metadata
  [{:keys [entity-type entity-id]}]
  (if (= entity-type :table)
    (resources-tools/check-table-resource-database entity-id)
    (resources-tools/check-card-resource-database entity-id))
  (if (= entity-type :metric)
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
      :with-segments? true})))

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
           :description "Retrieve metadata for up to 5 tables, 5 models, and 5 metrics per call."
           :args list-available-fields-schema))
  (batched-args [_ {table-ids :table_ids model-ids :model_ids metric-ids :metric_ids}]
    (into []
          (mapcat (fn [[kind ids]]
                    (validate-id-count ids (name kind))
                    (map (fn [id] {:entity-type kind :entity-id id}) ids)))
          [[:table table-ids] [:model model-ids] [:metric metric-ids]]))
  (compose [_ entries _ctx]
    (let [metadata (reduce (fn [metadata {:keys [item failed? output structured-output]}]
                             (if failed?
                               (update metadata :errors conj output)
                               (update metadata (case (:entity-type item)
                                                  :table :tables
                                                  :model :models
                                                  :metric :metrics)
                                       conj structured-output)))
                           {:result-type :metadata :tables [] :models [] :metrics [] :errors []}
                           entries)]
      {:output (llm-shape/get-metadata-result->xml metadata)
       :structured-output metadata})))

(def ^:private metadata-source-tool (->MetadataSourceTool))

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

(defn- format-field-metadata-output
  ;; NOTE: keep in sync with read_resource.clj/format-content :field-metadata branch
  [{:keys [field_id value_metadata portable_fk table_reference]}]
  (format-with-instructions
   (llm-shape/field-metadata->xml {:field_id field_id :value_metadata value_metadata
                                   :portable_fk portable_fk :table_reference table_reference})
   instructions/field-metadata-instructions))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (m/assoc-some result :output (some-> result :structured-output format-fn)))

(tools/defrecoverable unknown-metabot!
  "The metadata call has no Metabot row."
  {:payload [:map {:closed true}]}
  [_]
  {:message "No Metabot was provided for this call."
   :recovery [{:text "Ask the user to reopen the document and try again." :uses #{}}]})

(defrecord ListAvailableDataSourcesTool []
  tools/Tool
  (declaration [_]
    {:name "list_available_data_sources"
     :description "List all data sources (metrics and models) available to the metabot instance."
     :scope scope/agent-metadata-read
     :args [:map {:closed true}]})
  (handle [_ _args {:keys [metabot]}]
    (when-not (:id metabot)
      (unknown-metabot! {}))
    (add-output
     (entity-details-tools/answer-sources {:metabot metabot
                                           :with-field-values? false
                                           :with-measures? true
                                           :with-segments? true})
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
    (tools/with-entity {:kind (if (= data-source "report") :question (keyword data-source)) :id source-id}
      (if (= data-source "table")
        (resources-tools/check-table-resource-database source-id)
        (resources-tools/check-card-resource-database source-id)))
    (tools/with-entity {:kind :field :id field-id}
      (add-output (field-stats-tools/field-values {:entity-type data-source
                                                   :entity-id source-id
                                                   :field-id field-id
                                                   :limit nil})
                  format-field-metadata-output))))

(def get-field-values-tool
  "The `get_field_values` tool."
  (->GetFieldValuesTool))
