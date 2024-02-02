(ns metabase.lib.metadata.composed-provider
  (:require
   [clojure.core.protocols]
   [clojure.datafy :as datafy]
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as metadata.protocols]))

(defn- cached-providers [providers]
  (filter #(satisfies? metadata.protocols/CachedMetadataProvider %)
          providers))

(defn- object-for-id [f id metadata-providers]
  (some (fn [provider]
          (f provider id))
        metadata-providers))

(defn- objects-for-table-id [f table-id metadata-providers]
  (into []
        (comp
         (mapcat (fn [provider]
                   (f provider table-id)))
         (m/distinct-by :id))
        metadata-providers))

(deftype ComposedMetadataProvider [metadata-providers]
  metadata.protocols/MetadataProvider
  (database [_this]              (some metadata.protocols/database metadata-providers))
  (table    [_this table-id]     (object-for-id metadata.protocols/table   table-id     metadata-providers))
  (field    [_this field-id]     (object-for-id metadata.protocols/field   field-id     metadata-providers))
  (card     [_this card-id]      (object-for-id metadata.protocols/card    card-id      metadata-providers))
  (metric   [_this metric-id]    (object-for-id metadata.protocols/metric  metric-id    metadata-providers))
  (segment  [_this segment-id]   (object-for-id metadata.protocols/segment segment-id   metadata-providers))
  (setting  [_this setting-name] (object-for-id metadata.protocols/setting setting-name metadata-providers))
  (tables   [_this]              (m/distinct-by :id (mapcat metadata.protocols/tables metadata-providers)))
  (fields   [_this table-id]     (objects-for-table-id metadata.protocols/fields   table-id metadata-providers))
  (metrics  [_this table-id]     (objects-for-table-id metadata.protocols/metrics  table-id metadata-providers))
  (segments [_this table-id]     (objects-for-table-id metadata.protocols/segments table-id metadata-providers))

  metadata.protocols/CachedMetadataProvider
  (cached-database [_this]
    (some metadata.protocols/cached-database
          (cached-providers metadata-providers)))
  (cached-metadata [_this metadata-type id]
    (some #(metadata.protocols/cached-metadata % metadata-type id)
          (cached-providers metadata-providers)))
  (store-database! [_this database-metadata]
    (when-first [provider (cached-providers metadata-providers)]
      (metadata.protocols/store-database! provider database-metadata)))
  (store-metadata! [_this metadata-type id metadata]
    (when-first [provider (cached-providers metadata-providers)]
      (metadata.protocols/store-metadata! provider metadata-type id metadata)))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? ComposedMetadataProvider another)
         (= metadata-providers
            (.-metadata-providers ^ComposedMetadataProvider another))))

  clojure.core.protocols/Datafiable
  (datafy [_this]
    (cons `composed-metadata-provider (map datafy/datafy metadata-providers))))

(defn composed-metadata-provider
  "A metadata provider composed of several different `metadata-providers`. Methods try each constituent provider in
  turn from left to right until one returns a truthy result."
  [& metadata-providers]
  (->ComposedMetadataProvider metadata-providers))
