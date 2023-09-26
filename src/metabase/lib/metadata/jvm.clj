(ns metabase.lib.metadata.jvm
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.snake-hating-map :as u.snake-hating-map]
   [methodical.core :as methodical]
   [potemkin :as p]
   [pretty.core :as pretty]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(def ^:private MetadataType
  [:enum
   :metadata/database
   :metadata/table
   :metadata/column
   :metadata/card
   :metadata/metric
   :metadata/segment])

(mu/defn ^:private metadata-type->model :- :keyword
  [metadata-type :- MetadataType]
  (case metadata-type
    :metadata/database :model/Database
    :metadata/table    :model/Table
    :metadata/column   :model/Field
    :metadata/card     :model/Card
    :metadata/metric   :model/Metric
    :metadata/segment  :model/Segment))

(defmulti ^:private select
  {:arglists '([metadata-type database-id condition])}
  (fn [metadata-type _database-id _condition]
    (keyword metadata-type)))

(defn instance->metadata
  "Convert a (presumably) Toucan 2 instance of an application database model with `snake_case` keys to a MLv2 style
  metadata instance with `:lib/type` and `kebab-case` keys."
  [instance metadata-type]
  (-> instance
      (update-keys u/->kebab-case-en)
      (assoc :lib/type metadata-type)
      u.snake-hating-map/snake-hating-map))

(defmethod select :default
  [metadata-type _database-id condition]
  (into []
        (map #(instance->metadata % metadata-type))
        (let [model (metadata-type->model metadata-type)]
          (t2/reducible-select model
                               {:select [:*]
                                :from   [[(t2/table-name model) :model]]
                                :where  condition}))))

(defmethod select :metadata/database
  [_metadata-type _database-id condition]
  (into []
        (map (fn [database]
               (u.snake-hating-map/snake-hating-map
                (merge
                 {:lib/type     :metadata/database
                  :id           (:id database)
                  :engine       (:engine database)
                  :name         (:name database)
                  :dbms-version (:dbms_version database)
                  :settings     (:settings database)
                  :is-audit     (:is_audit database)
                  :features     (:features database)}
                 (when-let [details (:details database)]
                   ;; ignore encrypted details that we cannot decrypt, because that breaks schema
                   ;; validation
                   (when (map? details)
                     {:details details}))))))
        (t2/reducible-select :model/Database
                             {:select [:id :engine :name :dbms_version :details :settings :is_audit]
                              :from   [[(t2/table-name :model/Database) :model]]
                              :where  condition})))

(mu/defmethod select :metadata/table
  [_metadata-type
   database-id :- ::lib.schema.id/database
   condition]
  (into []
        (map (fn [table]
               (u.snake-hating-map/snake-hating-map
                {:lib/type     :metadata/table
                 :id           (:id table)
                 :name         (:name table)
                 :display-name (:display_name table)
                 :schema       (:schema table)})))
        (t2/reducible-select :model/Table
                             {:select [:id :name :display_name :schema]
                              :from   [[(t2/table-name :model/Table) :model]]
                              :where  [:and
                                       [:= :model.db_id database-id]
                                       condition]})))

(derive ::Field :model/Field)

(methodical/defmethod t2.model/model->namespace ::Field
  [_model]
  {:model/Dimension   "dimension"
   :model/FieldValues "values"})

(mu/defmethod select :metadata/column
  [_metadata-type
   database-id :- ::lib.schema.id/database
   condition]
  (into []
        (map (fn [field]
               (let [dimension-type (some-> (:dimension/type field) keyword)]
                 (u.snake-hating-map/snake-hating-map
                  (merge
                   {:lib/type           :metadata/column
                    :base-type          (:base_type field)
                    :coercion-strategy  (:coercion_strategy field)
                    :database-type      (:database_type field)
                    :description        (:description field)
                    :display-name       (:display_name field)
                    :effective-type     (:effective_type field)
                    :fingerprint        (:fingerprint field)
                    :fk-target-field-id (:fk_target_field_id field)
                    :id                 (:id field)
                    :name               (:name field)
                    :nfc-path           (:nfc_path field)
                    :parent-id          (:parent_id field)
                    :position           (:position field)
                    :semantic-type      (:semantic_type field)
                    :settings           (:settings field)
                    :table-id           (:table_id field)
                    :visibility-type    (:visibility_type field)}
                   (when (and (= dimension-type :external)
                              (:dimension/human_readable_field_id field))
                     {:lib/external-remap {:lib/type :metadata.column.remapping/external
                                           :id       (:dimension/id field)
                                           :name     (:dimension/name field)
                                           :field-id (:dimension/human_readable_field_id field)}})
                   (when (and (= dimension-type :internal)
                              (:values/values field)
                              (:values/human_readable_values field))
                     {:lib/internal-remap {:lib/type              :metadata.column.remapping/internal
                                           :id                    (:dimension/id field)
                                           :name                  (:dimension/name field)
                                           :values                (mi/json-out-with-keywordization
                                                                   (:values/values field))
                                           :human-readable-values (mi/json-out-without-keywordization
                                                                   (:values/human_readable_values field))}}))))))
        (t2/reducible-select ::Field
                             {:select    [:model.base_type
                                          :model.coercion_strategy
                                          :model.database_type
                                          :model.description
                                          :model.display_name
                                          :model.effective_type
                                          :model.fingerprint
                                          :model.fk_target_field_id
                                          :model.id
                                          :model.name
                                          :model.nfc_path
                                          :model.parent_id
                                          :model.position
                                          :model.semantic_type
                                          :model.settings
                                          :model.table_id
                                          :model.visibility_type
                                          :dimension.id
                                          :dimension.name
                                          :dimension.type
                                          :dimension.human_readable_field_id
                                          :values.values
                                          :values.human_readable_values]
                              :from      [[(t2/table-name :model/Field) :model]]
                              :left-join [[(t2/table-name :model/Dimension) :dimension]
                                          [:and
                                           [:= :dimension.field_id :model.id]
                                           [:inline [:in :dimension.type ["external" "internal"]]]]
                                          [(t2/table-name :model/FieldValues) :values]
                                          [:and
                                           [:= :values.field_id :model.id]
                                           [:= :values.type [:inline "full"]]]
                                          [(t2/table-name :model/Table) :table]
                                          [:= :model.table_id :table.id]]
                              :where     [:and
                                          [:= :table.db_id database-id]
                                          condition]})))

(defn- parse-persisted-info-definition [x]
  ((get-in (t2/transforms :model/PersistedInfo) [:definition :out] identity) x))

(derive ::Card :model/Card)

(methodical/defmethod t2.model/model->namespace ::Card
  [_model]
  {:model/PersistedInfo "persisted"})

(mu/defmethod select :metadata/card
  [_metadata-type
   database-id :- ::lib.schema.id/database
   condition]
  (into []
        (map (fn [card]
               (u.snake-hating-map/snake-hating-map
                (merge
                 {:lib/type               :metadata/card
                  :collection-id          (:collection_id card)
                  :database-id            (:database_id card)
                  :dataset                (:dataset card)
                  :dataset-query          (:dataset_query card)
                  :id                     (:id card)
                  :name                   (:name card)
                  :result-metadata        (:result_metadata card)
                  :table-id               (:table_id card)
                  :visualization-settings (:visualization_settings card)}
                 (when (:persisted/definition card)
                   {:lib/persisted-info {:active     (:persisted/active card)
                                         :state      (:persisted/state card)
                                         :definition (parse-persisted-info-definition (:persisted/definition card))
                                         :query-hash (:persisted/query_hash card)
                                         :table-name (:persisted/table_name card)}})))))
        (t2/reducible-select ::Card
                             {:select    [:model.collection_id
                                          :model.database_id
                                          :model.dataset
                                          :model.dataset_query
                                          :model.id
                                          :model.name
                                          :model.result_metadata
                                          :model.table_id
                                          :model.visualization_settings
                                          :persisted_info.active
                                          :persisted_info.state
                                          :persisted_info.definition
                                          :persisted_info.query_hash
                                          :persisted_info.table_name]
                              :from      [[(t2/table-name :model/Card) :model]]
                              :left-join [[(t2/table-name :model/PersistedInfo) :persisted_info]
                                          [:= :persisted_info.card_id :model.id]]
                              :where     [:and
                                          [:= :model.database_id database-id]
                                          condition]})))

(defn- bulk-instances
  "Fetch bulk instances with `metadata-type`. `database-id` is the ID the application database metadata provider was
  initialized with; it may be `nil` in some situations where it is used outside of the QP (see for
  example [[metabase.models.segment/warmed-metadata-provider]]). `ids` is a set of IDs to fetch.

  The [[lib.metadata.cached-provider/cached-metadata-provider]] layer on top of this should take care of filtering out
  and returning `ids` that have already been fetched."
  [metadata-type database-id ids]
  (when (seq ids)
    (let [model (metadata-type->model metadata-type)]
      (log/debugf "Fetching instances of %s with ID in %s" model (pr-str ids))
      (select metadata-type database-id [:in :model.id ids]))))

(mu/defn ^:private fetch-instance
  [metadata-type :- MetadataType
   database-id   :- ::lib.schema.id/database
   id            :- ::lib.schema.common/positive-int]
  (first (bulk-instances metadata-type database-id #{id})))

(mu/defn ^:private tables
  [database-id :- ::lib.schema.id/database]
  (when-not database-id
    (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                            `lib.metadata.protocols/tables
                            `UncachedApplicationDatabaseMetadataProvider)
                    {})))
  (log/debugf "Fetching all Tables for normally-visible Database %d" database-id)
  (select :metadata/table
          database-id
          [:and
           [:= :model.active true]
           [:not-in
            :model.visibility_type
            [[:inline "hidden"]
             [:inline "technical"]
             [:inline "cruft"]]]]))

(mu/defn ^:private fields
  [database-id :- ::lib.schema.id/database
   table-id    :- ::lib.schema.id/table]
  (log/debugf "Fetching all normally-visible Fields for Table %d" table-id)
  (select :metadata/column
          database-id
          [:and
           [:= :model.table_id table-id]
           [:= :model.active true]
           [:not-in :model.visibility_type [[:inline "sensitive"]
                                            [:inline "retired"]]]]))

(mu/defn ^:private metrics
  [database-id :- ::lib.schema.id/database
   table-id    :- ::lib.schema.id/table]
  (log/debugf "Fetching all Metrics for Table %d" table-id)
  (select :metadta/metric database-id [:= :model.table_id table-id]))

(p/deftype+ UncachedApplicationDatabaseMetadataProvider [database-id]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-not database-id
      (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                              `lib.metadata.protocols/database
                              `UncachedApplicationDatabaseMetadataProvider)
                      {})))
    (fetch-instance :metadata/database database-id database-id))

  (table   [_this table-id]   (fetch-instance :metadata/table   database-id table-id))
  (field   [_this field-id]   (fetch-instance :metadata/column  database-id field-id))
  (card    [_this card-id]    (fetch-instance :metadata/card    database-id card-id))
  (metric  [_this metric-id]  (fetch-instance :metadata/metric  database-id metric-id))
  (segment [_this segment-id] (fetch-instance :metadata/segment database-id segment-id))

  (tables [_this]
    (tables database-id))

  (fields [_this table-id]
    (fields database-id table-id))

  (metrics [_this table-id]
    (metrics database-id table-id))

  (setting [_this setting-name]
    (setting/get setting-name))

  lib.metadata.protocols/BulkMetadataProvider
  (bulk-metadata [_this metadata-type ids]
    (bulk-instances metadata-type database-id ids))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->UncachedApplicationDatabaseMetadataProvider database-id)))

(mu/defn application-database-metadata-provider :- lib.metadata/MetadataProvider
  "An implementation of [[metabase.lib.metadata.protocols/MetadataProvider]] for the application database.

  The application database metadata provider implements both of the optional
  protocols, [[metabase.lib.metadata.protocols/CachedMetadataProvider]]
  and [[metabase.lib.metadata.protocols/BulkMetadataProvider]]. All operations are cached; so you can use the bulk
  operations to pre-warm the cache if you need to."
  [database-id :- ::lib.schema.id/database]
  (lib.metadata.cached-provider/cached-metadata-provider
   (->UncachedApplicationDatabaseMetadataProvider database-id)))
