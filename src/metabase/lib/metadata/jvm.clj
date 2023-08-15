(ns metabase.lib.metadata.jvm
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:require
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

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
  {:arglists '([metadata-type condition])}
  (fn [metadata-type _condition]
    (keyword metadata-type)))

(defmethod select :default
  [metadata-type condition]
  (into []
        (map (fn [instance]
               (-> instance
                   (update-keys u/->kebab-case-en)
                   (assoc :lib/type metadata-type))))
        (let [model (metadata-type->model metadata-type)]
          (t2/reducible-select model
                               {:select [:*]
                                :from   [[(t2/table-name model) :model]]
                                :where  condition}))))

(defmethod select :metadata/database
  [_metadata-type condition]
  (into []
        (map (fn [database]
               {:lib/type     :metadata/database
                :id           (:id database)
                :engine       (:engine database)
                :name         (:name database)
                :dbms-version (:dbms_version database)
                :details      (:details database)
                :settings     (:settings database)
                :is-audit     (:is_audit database)}))
        (t2/reducible-select :model/Database
                             {:select [:id :engine :name :dbms_version :details :settings :is_audit]
                              :from   [[(t2/table-name :model/Database) :model]]
                              :where  condition})))

(defmethod select :metadata/table
  [_metadata-type condition]
  (into []
        (map (fn [table]
               {:lib/type     :metadata/table
                :id           (:id table)
                :name         (:name table)
                :display-name (:display_name table)
                :schema       (:schema table)}))
        (t2/reducible-select :model/Table
                             {:select [:id :name :display_name :schema]
                              :from   [[(t2/table-name :model/Table) :model]]
                              :where  condition})))

(defmethod select :metadata/column
  [_metadata-type condition]
  (into []
        (map (fn [field]
               (merge
                {:lib/type          :metadata/column
                 :base-type         (:base_type field)
                 :coercion-strategy (:coercion_strategy field)
                 :database-type     (:database_type field)
                 :description       (:description field)
                 :display-name      (:display_name field)
                 :effective-type    (:effective_type field)
                 :fingerprint       (:fingerprint field)
                 :id                (:id field)
                 :name              (:name field)
                 :nfc-path          (:nfc_path field)
                 :parent-id         (:parent_id field)
                 :position          (:position field)
                 :semantic-type     (:semantic_type field)
                 :settings          (:settings field)
                 :table-id          (:table_id field)
                 :visibility-type   (:visibility_type field)}
                (when (:dimension__id field)
                  {:lib/external-remap {:id       (:dimension__id field)
                                        :name     (:dimension__name field)
                                        :field-id (:dimension__field_id field)}}))))
        (t2/reducible-select :model/Field
                             {:select    [:model.base_type
                                          :model.coercion_strategy
                                          :model.database_type
                                          :model.description
                                          :model.display_name
                                          :model.effective_type
                                          :model.fingerprint
                                          :model.id
                                          :model.name
                                          :model.nfc_path
                                          :model.parent_id
                                          :model.position
                                          :model.semantic_type
                                          :model.settings
                                          :model.table_id
                                          :model.visibility_type
                                          [:dimension.id :dimension__id]
                                          [:dimension.human_readable_field_id :dimension__field_id]
                                          [:dimension.name :dimension__name]]
                              :from      [[(t2/table-name :model/Field) :model]]
                              :left-join [[(t2/table-name :model/Dimension) :dimension]
                                          [:and
                                           [:= :dimension.field_id :model.id]
                                           [:= :dimension.type "external"]]]
                              :where     condition})))

(mu/defn ^:private bulk-instances
  [metadata-type :- MetadataType
   ids           :- [:set ::lib.schema.common/positive-int]]
  {:pre [(set? ids) (every? integer? ids)]}
  (let [model (metadata-type->model metadata-type)]
    (log/debugf "Fetching instances of %s with ID in %s" model (pr-str ids))
    (select metadata-type [:model.id :in ids])))

(mu/defn ^:private fetch-instance
  [metadata-type :- MetadataType
   id            :- ::lib.schema.common/positive-int]
  (first (select metadata-type [:= :model.id id])))

(mu/defn ^:private tables
  [database-id :- ::lib.schema.id/database]
  (when-not database-id
    (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                            `lib.metadata.protocols/tables
                            `UncachedApplicationDatabaseMetadataProvider)
                    {})))
  (log/debugf "Fetching all Tables for Database %d" database-id)
  (select :metadata/table [:= :model.db_id database-id]))

(mu/defn ^:private fields
  [table-id :- ::lib.schema.id/table]
  (log/debugf "Fetching all Fields for Table %d" table-id)
  (select :metadata/column [:= :model.table_id table-id]))

(mu/defn ^:private metrics
  [table-id :- ::lib.schema.id/table]
  (log/debugf "Fetching all Metrics for Table %d" table-id)
  (select :metadta/metric [:= :model.table_id table-id]))

(p/deftype+ UncachedApplicationDatabaseMetadataProvider [database-id]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-not database-id
      (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                              `lib.metadata.protocols/database
                              `UncachedApplicationDatabaseMetadataProvider)
                      {})))
    (fetch-instance :metadata/database database-id))

  (table   [_this table-id]   (fetch-instance :metadata/table   table-id))
  (field   [_this field-id]   (fetch-instance :metadata/column   field-id))
  (card    [_this card-id]    (fetch-instance :metadata/card    card-id))
  (metric  [_this metric-id]  (fetch-instance :metadata/metric  metric-id))
  (segment [_this segment-id] (fetch-instance :metadata/segment segment-id))

  (tables [_this]
    (tables database-id))

  (fields [_this table-id]
    (fields table-id))

  (metrics [_this table-id]
    (metrics table-id))

  lib.metadata.protocols/BulkMetadataProvider
  (bulk-metadata [_this metadata-type ids]
    (bulk-instances metadata-type ids))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->UncachedApplicationDatabaseMetadataProvider database-id)))

(defn application-database-metadata-provider
  "An implementation of [[metabase.lib.metadata.protocols/MetadataProvider]] for the application database.

  The application database metadata provider implements both of the optional
  protocols, [[metabase.lib.metadata.protocols/CachedMetadataProvider]]
  and [[metabase.lib.metadata.protocols/BulkMetadataProvider]]. All operations are cached; so you can use the bulk
  operations to pre-warm the cache if you need to."
  ([]
   (application-database-metadata-provider nil))

  ([database-id]
   (lib.metadata.cached-provider/cached-metadata-provider
    (->UncachedApplicationDatabaseMetadataProvider database-id))))
