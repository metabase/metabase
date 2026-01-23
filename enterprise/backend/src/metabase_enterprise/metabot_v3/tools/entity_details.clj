(ns metabase-enterprise.metabot-v3.tools.entity-details
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.documents.core :as documents]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- convert-measure-or-segment
  "Convert a measure or segment metadata object to the format expected by the API."
  [metadata]
  (select-keys metadata [:id :name :display-name :description :definition]))

(defn verified-review?
  "Return true if the most recent ModerationReview for the given item id/type is verified."
  [id item-type]
  (let [review (t2/select-one [:model/ModerationReview :status]
                              :moderated_item_id id
                              :moderated_item_type item-type
                              :most_recent true
                              {:order-by [[:id :desc]]})]
    (= (:status review) "verified")))

(def ^:private max-glossary-items
  "Maximal number of items from glossary to include in Metabot's context."
  100)

(def ^:private glossary-order-column
  "Column to order by when selecting glossary items for Metabot's context injection."
  :updated_at)

(defn- glossary-for-context
  []
  ;; Rather small glossary sizes are anticipated. Additional count is bearable.
  (let [glossary-size (t2/count :model/Glossary)]
    (when (> glossary-size max-glossary-items)
      ;; If we are notified about the following warning we should reconsider current,
      ;; context injection, approach to glossary integration into Metabot.
      (log/warnf "Glossary size is larger than limit for context injection (%d > %d)."
                 glossary-size max-glossary-items)))
  (not-empty (t2/select-fn->fn :term :definition :model/Glossary
                               {:order-by [[glossary-order-column :desc]]
                                :limit max-glossary-items})))

(defn get-current-user
  "Get information about the current user."
  [_args]
  (if-let [{:keys [id email first_name last_name]}
           (or (some-> api/*current-user* deref)
               (t2/select-one [:model/User :id :email :first_name :last_name] api/*current-user-id*))]
    {:structured-output (merge {:id id
                                :type :user
                                :name (str first_name " " last_name)
                                :email-address email}
                               (when-some [glossary (glossary-for-context)]
                                 {:glossary glossary}))}
    {:output "current user not found"}))

(defn get-dashboard-details
  "Get information about the dashboard with ID `dashboard-id`."
  [{:keys [dashboard-id]}]
  (if-let [dashboard (t2/select-one [:model/Dashboard :id :description :name :collection_id] dashboard-id)]
    (do (api/read-check dashboard)
        {:structured-output
         (-> dashboard
             (dissoc :collection_id)
             (assoc :type :dashboard
                    :verified (verified-review? dashboard-id "dashboard")))})
    {:output "dashboard not found"}))

(defn- get-field-values [id->values id]
  (->
   (get id->values id)
   (or (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id id)))
   :values))

(defn- add-field-values
  [cols]
  (if-let [field-ids (seq (keep :id cols))]
    (let [id->values (field-values/batched-get-latest-full-field-values field-ids)]
      (map #(m/assoc-some % :field-values (some->> % :id (get-field-values id->values))) cols))
    cols))

(defn metric-details
  "Get metric details as returned by tools."
  ([id] (metric-details id nil))
  ([id options]
   (when-let [card (metabot-v3.tools.u/get-card id)]
     (metric-details card (lib-be/application-database-metadata-provider (:database_id card)) options)))
  ([card metadata-provider {:keys [field-values-fn with-default-temporal-breakout? with-queryable-dimensions?
                                   with-segments?]
                            :or   {field-values-fn                 add-field-values
                                   with-default-temporal-breakout? true
                                   with-queryable-dimensions?      true
                                   with-segments?                  false}}]
   (let [id (:id card)
         query-needed? (or with-default-temporal-breakout? with-queryable-dimensions? with-segments?)
         metric-query (when query-needed?
                        (lib/query metadata-provider (lib.metadata/card metadata-provider id)))
         breakouts (when query-needed?
                     (lib/breakouts metric-query))
         base-query (when query-needed?
                      (lib/remove-all-breakouts metric-query))
         visible-cols (when query-needed?
                        (->> (lib/visible-columns base-query)
                             (map #(metabot-v3.tools.u/add-table-reference base-query %))))
         col->index (when query-needed?
                      (into {} (map-indexed (fn [i col] [col i])) visible-cols))
         col-index (when query-needed?
                     #(-> % (dissoc :operators :field-values) col->index))
         default-temporal-breakout (when with-default-temporal-breakout?
                                     (->> breakouts
                                          (map #(lib/find-matching-column % visible-cols))
                                          (m/find-first lib.types.isa/temporal?)))
         field-id-prefix (metabot-v3.tools.u/card-field-id-prefix id)]
     (cond-> {:id id
              :type :metric
              :name (:name card)
              :description (:description card)
              :default_time_dimension_field_id (when default-temporal-breakout
                                                 (-> (metabot-v3.tools.u/->result-column
                                                      metric-query
                                                      default-temporal-breakout
                                                      (col-index default-temporal-breakout)
                                                      field-id-prefix)
                                                     :field_id))
              :verified (verified-review? id "card")}
       with-queryable-dimensions?
       (assoc :queryable-dimensions (into []
                                          (comp (map #(metabot-v3.tools.u/add-table-reference base-query %))
                                                (map #(metabot-v3.tools.u/->result-column
                                                       metric-query % (col-index %) field-id-prefix)))
                                          (->> (lib/filterable-columns base-query)
                                               field-values-fn)))

       with-segments?
       (assoc :segments (if-let [segments (lib/available-segments metric-query)]
                          (mapv convert-measure-or-segment segments)
                          []))))))

(defn- convert-metric
  ([db-metric metadata-provider]
   (convert-metric db-metric metadata-provider nil))
  ([db-metric metadata-provider options]
   (-> db-metric
       (metric-details metadata-provider (assoc options :with-queryable-dimensions? false))
       (select-keys  [:id :type :name :description :default_time_dimension_field_id]))))

(declare related-tables)

(defn- table-details
  ([id] (table-details id nil))
  ([id {:keys [metadata-provider field-values-fn with-fields? with-related-tables? with-metrics?
               with-measures? with-segments?]
        :or   {field-values-fn      add-field-values
               with-fields?         true
               with-related-tables? true
               with-metrics?        true
               with-measures?       false
               with-segments?       false}
        :as   options}]
   (when-let [base (if metadata-provider
                     (lib.metadata/table metadata-provider id)
                     (metabot-v3.tools.u/get-table id :db_id :description :name :schema))]
     (let [query-needed? (or with-fields? with-related-tables? with-metrics? with-measures? with-segments?)
           db-id (if metadata-provider (:db-id base) (:db_id base))
           db-engine (:engine (if metadata-provider
                                (lib.metadata/database metadata-provider)
                                (metabot-v3.tools.u/get-database db-id :engine)))
           mp (when query-needed?
                (or metadata-provider
                    (lib-be/application-database-metadata-provider db-id)))
           table-query (when query-needed?
                         (lib/query mp (lib.metadata/table mp id)))
           cols (when with-fields?
                  (->> (lib/visible-columns table-query -1 {:include-implicitly-joinable? false})
                       field-values-fn
                       (map #(metabot-v3.tools.u/add-table-reference table-query %))))
           field-id-prefix (when (or with-fields? with-related-tables?)
                             (metabot-v3.tools.u/table-field-id-prefix id))
           related-tables (when with-related-tables?
                            (related-tables table-query field-id-prefix with-fields? field-values-fn))]
       (-> {:id id
            :type :table
            :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column table-query %2 %1 field-id-prefix)) cols)
            :name (:name base)
            ;; :display_name should be (lib/display-name table-query), but we want to avoid creating the query if possible
            :display_name (some->> (:name base)
                                   (u.humanization/name->human-readable-name :simple))
            :database_id db-id
            :database_engine db-engine
            :database_schema (:schema base)}
           (m/assoc-some :description (:description base)
                         :related_tables related-tables
                         :metrics (when with-metrics?
                                    (not-empty (mapv #(convert-metric % mp options)
                                                     (lib/available-metrics table-query))))
                         :measures (when with-measures?
                                     (not-empty (mapv convert-measure-or-segment
                                                      (lib/available-measures table-query))))
                         :segments (when with-segments?
                                     (not-empty (mapv convert-measure-or-segment
                                                      (lib/available-segments table-query))))))))))

(defn related-tables
  "Constructs a list of tables, optionally including their fields, that are related to the given query via foreign key.
   Creates separate entries for each FK path when the same table is reachable through multiple foreign keys."
  [query main-field-id-prefix with-fields? field-values-fn]
  (let [all-main-cols    (lib/visible-columns query)
        ;; Map [table-id fk-field-id field-name] -> index in the main query
        contextual-index (into {}
                               (keep-indexed
                                (fn [idx {:keys [fk-field-id table-id name]}]
                                  (when fk-field-id
                                    {[table-id fk-field-id name] idx})))
                               all-main-cols)
        fk-cols          (filter :fk-field-id all-main-cols)
        ;; { [table-id fk-field-id] [fk-col ...] }
        grouped-fks      (group-by (juxt :table-id :fk-field-id) fk-cols)]
    (when (seq grouped-fks)
      (mapv
       (fn [[[table-id fk-field-id] _]]
         (let [base-details   (table-details table-id
                                             {:with-fields?          with-fields?
                                              :field-values-fn       field-values-fn
                                              :with-related-tables?  false
                                              :with-metrics?         false})
               base-table-col (lib.metadata/field query fk-field-id)
               fk-field-name  (:name base-table-col)
               updated-fields
               (when with-fields?
                 (->> (:fields base-details)
                      (keep
                       (fn [{:keys [name] :as field}]
                         (when-let [idx (get contextual-index [table-id fk-field-id name])]
                           (assoc field :field_id (str main-field-id-prefix idx)))))))]
           (-> (cond-> base-details
                 updated-fields (assoc :fields updated-fields))
               (assoc :related_by fk-field-name))))
       grouped-fks))))

(defn- card-details
  "Get details for a card."
  ([id] (card-details id nil))
  ([id options]
   (when-let [card (metabot-v3.tools.u/get-card id)]
     (card-details card (lib-be/application-database-metadata-provider (:database_id card)) options)))
  ([base metadata-provider {:keys [field-values-fn with-fields? with-related-tables? with-metrics?
                                   with-measures? with-segments?]
                            :or   {field-values-fn      add-field-values
                                   with-fields?         true
                                   with-related-tables? true
                                   with-metrics?        true
                                   with-measures?       false
                                   with-segments?       false}
                            :as   options}]
   (let [id (:id base)
         database-id (:database_id base)
         database-engine (:engine (lib.metadata/database metadata-provider))
         card-metadata (lib.metadata/card metadata-provider id)
         dataset-query (get card-metadata :dataset-query)
         query-needed? (or with-fields? with-related-tables? with-metrics? with-measures? with-segments?)
         ;; pivot questions have strange result-columns so we work with the dataset-query
         card-type (:type base)
         card-query (when query-needed?
                      (lib/query metadata-provider (if (and (#{:question} card-type)
                                                            (#{:pivot} (:display base))
                                                            (#{:query} (:type dataset-query)))
                                                     dataset-query
                                                     card-metadata)))
         returned-fields (when with-fields?
                           (->> (lib/returned-columns card-query)
                                field-values-fn))
         field-id-prefix (metabot-v3.tools.u/card-field-id-prefix id)
         related-tables (when with-related-tables?
                          (related-tables card-query field-id-prefix with-fields? field-values-fn))]
     (-> {:id id
          :type card-type
          :fields (into [] (map-indexed #(metabot-v3.tools.u/->result-column card-query %2 %1 field-id-prefix)) returned-fields)
          :name (:name base)
          :display_name (some->> (:name base)
                                 (u.humanization/name->human-readable-name :simple))
          :database_id database-id
          :database_engine database-engine
          :verified (verified-review? id "card")}
         (m/assoc-some
          :description (:description base)
          :related_tables related-tables
          :metrics (when with-metrics?
                     (not-empty (mapv #(convert-metric % metadata-provider options)
                                      (lib/available-metrics card-query))))
          :measures (when with-measures?
                      (not-empty (mapv convert-measure-or-segment
                                       (lib/available-measures card-query))))
          :segments (when with-segments?
                      (not-empty (mapv convert-measure-or-segment
                                       (lib/available-segments card-query)))))))))

(defn cards-details
  "Get the details of metrics or models as specified by `card-type` and `cards`
  from the database with ID `database-id` respecting `options`."
  [card-type database-id cards options]
  (let [mp (lib-be/application-database-metadata-provider database-id)
        detail-fn (case card-type
                    :metric metric-details
                    :model card-details)]
    (lib.metadata/bulk-metadata mp :metadata/card (map :id cards))
    (map #(-> (detail-fn % mp (u/assoc-default options :field-values-fn identity))
              (assoc :type card-type))
         cards)))

(defn answer-sources
  "Get the details of metrics and models in the scope of the Metabot instance with ID `metabot-id`.
  Accepts a map with `:metabot-id` and optional options for field values."
  [{:keys [metabot-id] :as options}]
  (if-let [normalized-metabot-id (metabot-v3.config/normalize-metabot-id metabot-id)]
    (lib-be/with-metadata-provider-cache
      (let [metrics-and-models (metabot-v3.tools.u/get-metrics-and-models normalized-metabot-id)
            {metrics :metric, models :model}
            (->> (for [[[card-type database-id] cards] (group-by (juxt :type :database_id) metrics-and-models)
                       detail (cards-details card-type database-id cards options)]
                   detail)
                 (group-by :type))]
        {:structured-output {:metrics (vec metrics)
                             :models  (vec models)}}))
    (throw (ex-info (i18n/tru "Invalid metabot_id {0}" metabot-id)
                    {:metabot_id metabot-id, :status-code 400}))))

(defn get-table-details
  "Get information about the table or model with ID `table-id`.
  `table-id` is string either encoding an integer that is the ID of a table
  or a string containing the prefix card__ and the ID of a model (card) as suffix.
  Alternatively, `table-id` can be an integer ID of a table.
  `model-id` is an integer ID of a model (card). Exactly one of `table-id` or `model-id`
  should be supplied."
  [{:keys [model-id table-id] :as arguments}]
  (try
    (lib-be/with-metadata-provider-cache
      (let [options (cond-> arguments
                      (= (:with-field-values? arguments) false) (assoc :field-values-fn identity))
            details (cond
                      (int? model-id)
                      (let [card (card-details model-id (assoc options :only-model true))]
                        (if (= :model (:type card))
                          card
                          (throw (ex-info (format "ID %s is not a valid model id, it's a question" model-id)
                                          {:agent-error? true :status-code 400}))))

                      (int? table-id)
                      (or (table-details table-id options)
                          (throw (ex-info (str "Table " table-id " not found")
                                          {:agent-error? true :status-code 404})))

                      (string? table-id)
                      (if-let [[_ card-id] (re-matches #"card__(\d+)" table-id)]
                        (or (card-details (parse-long card-id) options)
                            (throw (ex-info (str "Model " card-id " not found")
                                            {:agent-error? true :status-code 404})))
                        (if (re-matches #"\d+" table-id)
                          (or (table-details (parse-long table-id) options)
                              (throw (ex-info (str "Table " table-id " not found")
                                              {:agent-error? true :status-code 404})))
                          (throw (ex-info "invalid table_id format"
                                          {:agent-error? true :status-code 400}))))

                      :else
                      (throw (ex-info "invalid arguments: must provide table-id or model-id"
                                      {:agent-error? true :status-code 400})))]
        {:structured-output details}))
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(defn get-metric-details
  "Get information about the metric with ID `metric-id`."
  [{:keys [metric-id] :as arguments}]
  (try
    (lib-be/with-metadata-provider-cache
      (let [options (cond-> arguments
                      (= (:with-field-values? arguments) false) (assoc :field-values-fn identity))
            details (if (int? metric-id)
                      (or (metric-details metric-id options)
                          (throw (ex-info (str "Metric " metric-id " not found")
                                          {:agent-error? true :status-code 404})))
                      (throw (ex-info "invalid metric_id format"
                                      {:agent-error? true :status-code 400})))]
        {:structured-output details}))
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(defn get-report-details
  "Get information about the report (card) with ID `report-id`."
  [{:keys [report-id] :as arguments}]
  (lib-be/with-metadata-provider-cache
    (let [options (cond-> arguments
                    (= (:with-field-values? arguments) false) (assoc :field-values-fn identity))
          details (if (int? report-id)
                    (let [details (card-details report-id options)]
                      (some-> details
                              (select-keys [:id :type :description :name :verified])
                              (assoc :result-columns (:fields details))))
                    "invalid report_id")]
      (if (map? details)
        {:structured-output details}
        {:output (or details "report not found")}))))

(defn get-document-details
  "Get information about the document with ID `document-id`."
  [{:keys [document-id]}]
  (if (int? document-id)
    (try
      (if-let [doc (documents/get-document document-id)]
        {:structured-output {:id (:id doc)
                             :name (:name doc)
                             :document (:document doc)}}
        {:output "document not found"})
      (catch Exception e
        {:output (str "error fetching document: " (.getMessage e))}))
    {:output "invalid document_id"}))

(defn- execute-query
  [query-id query-input]
  (let [normalized-query (lib-be/normalize-query query-input)
        field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        database-id (:database normalized-query)
        _ (api/read-check :model/Database database-id)
        mp (lib-be/application-database-metadata-provider database-id)
        query (lib/query mp normalized-query)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query-id query-id
     :query normalized-query
     :result-columns (into []
                           (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 field-id-prefix))
                           returned-cols)}))

(defn get-query-details
  "Get the details of a query (supports both MBQL v4 and v5)."
  [{:keys [query]}]
  (lib-be/with-metadata-provider-cache
    {:structured-output (execute-query (u/generate-nano-id) query)}))
