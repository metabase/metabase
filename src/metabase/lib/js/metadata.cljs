(ns metabase.lib.js.metadata
  (:require
   [goog]
   [goog.object :as gobject]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util :as u]
   [metabase.util.log :as log]))

;;; metabase-lib/metadata/Metadata comes in a class like
;;;
;;;    {
;;;      databases: {},
;;;      tables: {},
;;;      fields: {},
;;;      metrics: {},
;;;      segments: {},
;;;      questions: {},
;;;    }
;;;
;;; where keys are a map of String ID => metadata

(defn- obj->clj [init xform obj]
  (into init
        (comp (map (fn [k]
                     [(keyword k) (gobject/get obj k)]))
              (remove (fn [[_k v]]
                        (= (goog/typeOf v) "function")))
              xform)
        (gobject/getKeys obj)))

(defmulti ^:private metadata->clj*
  {:arglists '([metadata-type obj])}
  (fn [metadata-type _obj]
    metadata-type))

(def ^:private map-pair-value->clj-xform
  (map (fn [[k v]]
         [k (js->clj v)])))

(defmethod metadata->clj* :database
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/database}
            (comp (remove (fn [[k _v]]
                            (= k "tables")))
                  map-pair-value->clj-xform
                  (map (fn [[k v]]
                         [k (if (= k :features)
                              (into #{} (map keyword v))
                              v)])))
            obj))

(defmethod metadata->clj* :table
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/table}
            (comp (remove (fn [[k _v]]
                            (= k "fields")))
                  map-pair-value->clj-xform)
            obj))

(defmethod metadata->clj* :field
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/field}
            (comp (remove (fn [[k _v]]
                            (= k "table")))
                  map-pair-value->clj-xform)
            obj))

(defmethod metadata->clj* :metric
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/metric}
            (comp (remove (fn [[k _v]]
                            (or (= k "database")
                                (= k "table"))))
                  map-pair-value->clj-xform)
            obj))

(defmethod metadata->clj* :segment
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/segment}
            (comp (remove (fn [[k _v]]
                            (or (= k "database")
                                (= k "table"))))
                  map-pair-value->clj-xform)
            obj))

(defn- metadata-map->clj [metadata-type m]
  (into {}
        (comp (map (fn [k]
                     [(parse-long k) (gobject/get m k)]))
              (remove (fn [[_k v]]
                        (= (goog/typeOf v) "function")))
              (map (fn [[k v]]
                     [k (metadata->clj* metadata-type v)])))
        (gobject/getKeys m)))

(defn- metadata->clj [metadata]
  (into {}
        [(when-let [databases (gobject/get metadata "databases")]
           [:databases (metadata-map->clj :database databases)])
         (when-let [tables (gobject/get metadata "tables")]
           [:tables (metadata-map->clj :table tables)])
         (when-let [fields (gobject/get metadata "fields")]
           [:fields (metadata-map->clj :field fields)])
         (when-let [metrics (gobject/get metadata "metrics")]
           [:metrics (metadata-map->clj :metric metrics)])
         (when-let [segments (gobject/get metadata "segments")]
           [:segments (metadata-map->clj :segment segments)])]))

(defn- database [metadata database-id]
  (get-in metadata [:databases database-id]))

(defn- table [metadata table-id]
  (get-in metadata [:tables table-id]))

(defn- field [metadata field-id]
  (get-in metadata [:fields field-id]))

(defn- metric [metadata metric-id]
  (get-in metadata [:metrics metric-id]))

(defn- segment [metadata segment-id]
  (get-in metadata [:segments segment-id]))

(defn- tables [database-id metadata]
  (filter (fn [table-metadata]
            (= (:db_id table-metadata) database-id))
          (get-in metadata [:tables])))

(defn- fields [metadata table-id]
  (filter (fn [table-metadata]
            (= (:table_id table-metadata) table-id))
          (get-in metadata [:fields])))

(defrecord ^:private MLv1QuestionMetadataProvider [database-id metadata]
  lib.metadata.protocols/MetadataProvider
  (database [_this]            (database metadata database-id))
  (table    [_this table-id]   (table    metadata table-id))
  (field    [_this field-id]   (field    metadata field-id))
  (metric   [_this metric-id]  (metric   metadata metric-id))
  (segment  [_this segment-id] (segment  metadata segment-id))
  ;; (card     [_this card-id]    (card     metadata card-id))
  (tables   [_this]            (tables   database-id metadata))
  (fields   [_this table-id]   (fields   metadata table-id)))

(defn metadata-provider
  "Use a `metabase-lib/metadata/Metadata` as a [[metabase.lib.metadata.protocols/MetadataProvider]]."
  [database-id metadata]
  (let [clj-metadata (metadata->clj metadata)]
    (log/debugf "Parsed metadata: %s" (u/pprint-to-str clj-metadata))
    (->MLv1QuestionMetadataProvider database-id clj-metadata)))
