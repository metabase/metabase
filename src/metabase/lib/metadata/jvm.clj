(ns metabase.lib.metadata.jvm
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:require
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(defn- metadata-type->model [metadata-type]
  (case metadata-type
    :metadata/database :model/Database
    :metadata/table    :model/Table
    :metadata/column    :model/Field
    :metadata/card     :model/Card
    :metadata/metric   :model/Metric
    :metadata/segment  :model/Segment))

(defn- instance->metadata [instance metadata-type]
  (some-> instance
          (update-keys u/->kebab-case-en)
          (assoc :lib/type metadata-type)))

(defn- fetch-instance [metadata-type id]
  {:pre [(integer? id)]}
  (let [model (metadata-type->model metadata-type)]
    (log/debugf "Fetching %s %d" model id)
    (instance->metadata (t2/select-one model :id id) metadata-type)))

(defn- bulk-instances [metadata-type ids]
  (let [model (metadata-type->model metadata-type)]
    (log/debugf "Fetching instances of %s with ID in %s" model (pr-str (sort ids)))
    (for [instance (t2/select model :id [:in ids])]
      (instance->metadata instance metadata-type))))

(defn- tables [database-id]
  (when-not database-id
    (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                            `lib.metadata.protocols/tables
                            `UncachedApplicationDatabaseMetadataProvider)
                    {})))
  (log/debugf "Fetching all Tables for Database %d" database-id)
  (mapv #(instance->metadata % :metadata/table)
        (t2/select :model/Table :db_id database-id)))

(defn- fields [table-id]
  (log/debugf "Fetching all Fields for Table %d" table-id)
  (mapv #(instance->metadata % :metadata/column)
        (t2/select :model/Field :table_id table-id)))

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
