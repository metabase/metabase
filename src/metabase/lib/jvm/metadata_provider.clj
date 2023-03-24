(ns metabase.lib.jvm.metadata-provider
  "Implementation(s) of [[metabase.lib.metadata.protocols/MetadataProvider]] only for the JVM."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models :refer [Card Database Field Metric Segment Table]]
   [metabase.util.log :as log]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(defn- fetch-instance [model id metadata-type]
  {:pre [(integer? id)]}
  (log/infof "Fetching %s %d" model id)
  (when-some [instance (t2/select-one model :id id)]
    (assoc instance :lib/type metadata-type)))

(p/deftype+ UncachedApplicationDatabaseMetadataProvider [database-id]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-not database-id
      (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                              `lib.metadata.protocols/database
                              `UncachedApplicationDatabaseMetadataProvider)
                      {})))
    (fetch-instance Database database-id :metadata/database))

  (table [_this table-id]
    (fetch-instance Table table-id :metadata/table))

  (field [_this field-id]
    (fetch-instance Field field-id :metadata/field))

  (card [_this card-id]
    (fetch-instance Card card-id :metadata/card))

  (metric [_this metric-id]
    (fetch-instance Metric metric-id :metadata/metric))

  (segment [_this segment-id]
    (fetch-instance Segment segment-id :metadata/segment))

  (tables [_this]
    (when-not database-id
      (throw (ex-info (format "Cannot use %s with %s with a nil Database ID"
                              `lib.metadata.protocols/tables
                              `UncachedApplicationDatabaseMetadataProvider)
                      {})))
    (log/infof "Fetching all Tables for Database %d" database-id)
    (into []
          (map #(assoc % :lib/type :metadata/table))
          (t2/reducible-select Table :db_id database-id)))

  (fields [_this table-id]
    (log/infof "Fetching all Fields for Table %d" table-id)
    (into []
          (map #(assoc % :lib/type :metadata/field))
          (t2/reducible-select Field :table_id table-id)))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->UncachedApplicationDatabaseMetadataProvider database-id)))

(defn- get-in-cache [cache ks value-thunk]
  (if-some [cached-value (get-in @cache ks)]
    (when-not (= cached-value ::nil)
      cached-value)
    (let [value (value-thunk)]
      (swap! cache assoc ks (if (some? value) value ::nil))
      value)))

(defn- store-instances! [cache k metadata-type instances]
  (swap! cache update k merge (m/index-by :id (map #(assoc % :lib/type metadata-type) instances))))

(defn- cache-instances! [cache k metadata-type model ids]
  (when (seq ids)
    (log/infof "Caching instances of %s with IDs..." model (pr-str (sort ids)))
    (let [existing (set (keys (get @cache k)))
          missing  (set/difference (set ids) existing)]
      (log/infof "Already fetched: %s" (pr-str (sort (set/union (set ids) existing))))
      (when (seq missing)
        (log/infof "Need to fetch: %s" (pr-str (sort missing)))
        (store-instances! cache k metadata-type (t2/select model :id [:in missing]))))
    (for [id ids]
      (get-in cache [k id]))))

;;; TODO -- if we were smart, Tables and Fields could look at all of the already-cached Tables and Fields for their
;;; Database/Table respectively, and skip fetching them again.

(p/deftype+ CachedMetadataProvider [cache metadata-provider]
  lib.metadata.protocols/MetadataProvider
  (database [_this]            (get-in-cache cache [:database]              #(lib.metadata.protocols/database metadata-provider)))
  (table    [_this table-id]   (get-in-cache cache [:tables table-id]       #(lib.metadata.protocols/table    metadata-provider table-id)))
  (field    [_this field-id]   (get-in-cache cache [:fields field-id]       #(lib.metadata.protocols/field    metadata-provider field-id)))
  (card     [_this card-id]    (get-in-cache cache [:cards card-id]         #(lib.metadata.protocols/card     metadata-provider card-id)))
  (metric   [_this metric-id]  (get-in-cache cache [:metrics metric-id]     #(lib.metadata.protocols/metric   metadata-provider metric-id)))
  (segment  [_this segment-id] (get-in-cache cache [:segments segment-id]   #(lib.metadata.protocols/segment  metadata-provider segment-id)))
  (tables   [_this]            (get-in-cache cache [:database-tables]       #(lib.metadata.protocols/tables   metadata-provider)))
  (fields   [_this table-id]   (get-in-cache cache [:table-fields table-id] #(lib.metadata.protocols/fields   metadata-provider table-id)))

  lib.metadata.protocols/WarmableMetadataProvider
  (store-tables!   [_this tables]   (store-instances! cache :tables   :metadata/table   tables))
  (store-fields!   [_this fields]   (store-instances! cache :fields   :metadata/field   fields))
  (store-cards!    [_this cards]    (store-instances! cache :cards    :metadata/card    cards))
  (store-metrics!  [_this metrics]  (store-instances! cache :metrics  :metadata/metric  metrics))
  (store-segments! [_this segments] (store-instances! cache :segments :metadata/segment segments))

  (fetch-tables!   [_this table-ids]   (cache-instances! cache :tables   :metadata/table   Table   table-ids))
  (fetch-fields!   [_this field-ids]   (cache-instances! cache :fields   :metadata/field   Field   field-ids))
  (fetch-cards!    [_this card-ids]    (cache-instances! cache :cards    :metadata/card    Card    card-ids))
  (fetch-metrics!  [_this metric-ids]  (cache-instances! cache :metrics  :metadata/metric  Metric  metric-ids))
  (fetch-segments! [_this segment-ids] (cache-instances! cache :segments :metadata/segment Segment segment-ids))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->CachedMetadataProvider cache metadata-provider)))

(defn application-database-metadata-provider
  ([]
   (application-database-metadata-provider nil))

  ([database-id]
   (->CachedMetadataProvider (atom {}) (->UncachedApplicationDatabaseMetadataProvider database-id))))
