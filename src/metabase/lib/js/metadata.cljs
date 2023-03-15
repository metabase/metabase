(ns metabase.lib.js.metadata
  (:require
   [clojure.string :as str]
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
  (if-let [plain-object (gobject/get obj "_plainObject")]
    (into {} xform (js->clj plain-object))
    (into init
          (comp (map (fn [k]
                       [(keyword k) (gobject/get obj k)]))
                (remove (fn [[_k v]]
                          (= (goog/typeOf v) "function")))
                xform)
          (gobject/getKeys obj))))

(defmulti ^:private parse-object
  {:arglists '([metadata-type obj])}
  (fn [metadata-type _obj]
    metadata-type))

(def ^:private map-pair-value->clj-xform
  (map (fn [[k v]]
         [k (js->clj v)])))

(defmethod parse-object :database
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

(defmethod parse-object :table
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/table}
            (comp (remove (fn [[k _v]]
                            (= k "fields")))
                  map-pair-value->clj-xform)
            obj))

(defmethod parse-object :field
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/field}
            (comp (remove (fn [[k _v]]
                            (= k "table")))
                  map-pair-value->clj-xform)
            obj))

(defmethod parse-object :card
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/card}
            (comp (remove (fn [[k _v]]
                            (or (= k "database")
                                (= k "table"))))
                  map-pair-value->clj-xform)
            obj))

(defmethod parse-object :metric
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/metric}
            (comp (remove (fn [[k _v]]
                            (or (= k "database")
                                (= k "table"))))
                  map-pair-value->clj-xform)
            obj))

(defmethod parse-object :segment
  [_metadata-type obj]
  (obj->clj {:lib/type :metadata/segment}
            (comp (remove (fn [[k _v]]
                            (or (= k "database")
                                (= k "table"))))
                  map-pair-value->clj-xform)
            obj))

(defmulti ^:private parse-objects
  {:arglists '([metadata-type id->object])}
  (fn [metadata-type _id->object]
    metadata-type))

(defn- parse-object-xform [metadata-type id->object]
  (comp (map (fn [id-str]
               [(parse-long id-str) (gobject/get id->object id-str)]))
        (remove (fn [[_id v]]
                  (= (goog/typeOf v) "function")))
        (map (fn [[id v]]
               [id (parse-object metadata-type v)]))))

(defmethod parse-objects :default
  [metadata-type id->object]
  (into {}
        (parse-object-xform metadata-type id->object)
        (gobject/getKeys id->object)))

(defmethod parse-objects :table
  [metadata-type id->object]
  (into {}
        (comp
         ;; ignore 'tables' whose ID is `card__` something; we'll put those in the `:card` section instead (see below)
         (remove (fn [id-str]
                   (str/starts-with? id-str "card__")))
         (parse-object-xform metadata-type id->object))
        (gobject/getKeys id->object)))

;;; handle Cards whose metadata is actually `:tables`
(defmethod parse-objects :table->card
  [_metadata-type id->object]
  (into {}
        (comp
         ;; keep only the 'tables' whose ID is `card__` something
         (filter (fn [id-str]
                   (str/starts-with? id-str "card__")))
         ;; strip off the `card__` prefix so we can parse this as an ID inside [[parse-object-xform]]
         (map (fn [id-str]
                (str/replace id-str #"^card__" "")))
         (parse-object-xform :card id->object))
        (gobject/getKeys id->object)))

(defn- metadata->clj [metadata]
  (try
    (into {}
          [(when-let [databases (gobject/get metadata "databases")]
             [:databases (parse-objects :database databases)])
           (when-let [tables (gobject/get metadata "tables")]
             [:tables (parse-objects :table tables)])
           (when-let [fields (gobject/get metadata "fields")]
             [:fields (parse-objects :field fields)])
           (when-let [cards (gobject/get metadata "questions")]
             [:cards (concat
                      (parse-objects :card cards)
                      (when-let [tables (gobject/get metadata "tables")]
                        (parse-objects :table->card tables)))])
           (when-let [metrics (gobject/get metadata "metrics")]
             [:metrics (parse-objects :metric metrics)])
           (when-let [segments (gobject/get metadata "segments")]
             [:segments (parse-objects :segment segments)])])
    (catch js/Error e
      (throw (ex-info (str "Error parsing metadata: " (ex-message e))
                      {:metadata metadata}
                      e)))))

(defn- database [metadata database-id]
  (get-in metadata [:databases database-id]))

(defn- table [metadata table-id]
  (get-in metadata [:tables table-id]))

(defn- field [metadata field-id]
  (get-in metadata [:fields field-id]))

(defn- card [metadata card-id]
  (get-in metadata [:cards card-id]))

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

(defn metadata-provider
  "Use a `metabase-lib/metadata/Metadata` as a [[metabase.lib.metadata.protocols/MetadataProvider]]."
  [database-id metadata]
  (let [clj-metadata (metadata->clj metadata)]
    (log/infof "Parsed metadata: %s" (u/pprint-to-str clj-metadata))
    (reify lib.metadata.protocols/MetadataProvider
      (database [_this]            (database metadata database-id))
      (table    [_this table-id]   (table    metadata table-id))
      (field    [_this field-id]   (field    metadata field-id))
      (metric   [_this metric-id]  (metric   metadata metric-id))
      (segment  [_this segment-id] (segment  metadata segment-id))
      (card     [_this card-id]    (card     metadata card-id))
      (tables   [_this]            (tables   database-id metadata))
      (fields   [_this table-id]   (fields   metadata table-id)))))
