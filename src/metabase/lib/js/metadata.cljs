(ns metabase.lib.js.metadata
  (:require
   [clojure.pprint :as pprint]
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

(def ^:private remove-function-values-xform
  (remove (fn [[_k v]]
            (= (goog/typeOf v) "function"))))

(defn- obj->clj [init xform obj]
  (if-let [plain-object (gobject/get obj "_plainObject")]
    (into init
          (comp xform
                (map (fn [[k v]]
                       [(keyword k) v])))
          (js->clj plain-object))
    (into init
          (comp (map (fn [k]
                       [(keyword k) (gobject/get obj k)]))
                remove-function-values-xform
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
                         [k (if (= k "features")
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
                                (= k "table")
                                (= k "fields")
                                (= k "dimension_options"))))
                  map-pair-value->clj-xform)
            obj))

(defmethod parse-object :table->card
  [_metadata-type obj]
  (parse-object
   :card
   (if-let [card (gobject/get obj "_card")]
     card
     obj)))

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

(def ^:private remove-nil-values-xform
  (remove (fn [[_id obj]]
            (nil? obj))))

(defn- parse-object-xform
  "One arity: a map key-value pair transducer that assumes ID is already parsed:

      [id js-object] => [id (delay => clj-object)]

  Two arity, takes unparsed ID string, gets object, parses ID, then hands off to the one-arity:

     id-str => [parsed-id (delay => clj-object)]"
  ([metadata-type]
   (comp remove-function-values-xform
         remove-nil-values-xform
         (map (fn [[id obj]]
                ;; if there is an error parsing something, catch it and log it and ignore that object, rather than
                ;; having the entire thing fail.
                [id (delay
                      (try
                        (log/debugf "Parse metadata for %s %s from:\n%s" metadata-type id (pr-str obj))
                        (let [parsed (parse-object metadata-type obj)]
                          (log/debugf "Parsed metadata for %s %s:\n%s" metadata-type id (binding [pprint/*print-right-margin* 160]
                                                                                          (u/pprint-to-str parsed)))
                          parsed)
                        (catch js/Error e
                          (log/errorf e "Error parsing %s: %s" metadata-type (ex-message e))
                          nil)))]))))

  ([metadata-type id->object]
   (comp (filter (fn [id-str]
                   (re-matches #"^\d+$" id-str)))
         (map (fn [id-str]
                [(parse-long id-str) (gobject/get id->object id-str)]))
         (parse-object-xform metadata-type))))

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
  [metadata-type id->object]
  (into {}
        (comp
         ;; keep only the 'tables' whose ID is `card__` something
         (filter (fn [id-str]
                   (str/starts-with? id-str "card__")))
         ;; strip off the `card__` prefix so we can parse this as an ID inside [[parse-object-xform]]
         (map (fn [card-id-str]
                (let [id-str (str/replace card-id-str #"^card__" "")]
                  [(parse-long id-str) (gobject/get id->object card-id-str)])))
         (parse-object-xform metadata-type)
         (map (fn [[id card-delay]]
                [id (delay
                      (assoc @card-delay :id id))])))
        (gobject/getKeys id->object)))

(defn- parse-objects* [metadata-type id->object]
  (try
    (parse-objects metadata-type id->object)
    (catch js/Error e
      (throw (ex-info (str "Error parsing " metadata-type " metadata objects: " (ex-message e))
                      {:metadata-type metadata-type}
                      e)))))

(defn- metadata->clj [metadata]
  {:databases (delay (when-let [databases (gobject/get metadata "databases")]
                       (parse-objects* :database databases)))
   :tables    (delay (when-let [tables (gobject/get metadata "tables")]
                       (parse-objects* :table tables)))
   :fields    (delay (when-let [fields (gobject/get metadata "fields")]
                       (parse-objects :field fields)))
   :cards     (delay (merge
                      (when-let [cards (gobject/get metadata "questions")]
                        (parse-objects* :card cards))
                      (when-let [tables (gobject/get metadata "tables")]
                        (parse-objects* :table->card tables))))
   :metrics  (delay (when-let [metrics (gobject/get metadata "metrics")]
                      (parse-objects* :metric metrics)))
   :segments (delay (when-let [segments (gobject/get metadata "segments")]
                      (parse-objects* :segment segments)))})

(defn- database [metadata database-id]
  (try
    (some-> (get @(:databases metadata) database-id) deref)
    (catch js/Error e
      (log/errorf e "Error getting metadata for Database %s: %s" database-id (ex-message e))
      nil)))

(defn- table [metadata table-id]
  (try
    (some-> (get @(:tables metadata) table-id) deref)
    (catch js/Error e
      (log/errorf e "Error getting metadata for Table %s: %s" table-id (ex-message e))
      nil)))

(defn- field [metadata field-id]
  (try
    (some-> (get @(:fields metadata) field-id) deref)
    (catch js/Error e
      (log/errorf e "Error getting metadata for Field %s: %s" field-id (ex-message e))
      nil)))

(defn- card [metadata card-id]
  (try
    (some-> (get @(:cards metadata) card-id) deref)
    (catch js/Error e
      (log/errorf e "Error getting metadata for Card %s: %s" card-id (ex-message e))
      nil)))

(defn- metric [metadata metric-id]
  (try
    (some-> (get @(:metrics metadata) metric-id) deref)
    (catch js/Error e
      (log/errorf e "Error getting metadata for Metric %s: %s" metric-id (ex-message e))
      nil)))

(defn- segment [metadata segment-id]
  (try
    (some-> (get @(:segments metadata) segment-id) deref)
    (catch js/Error e
      (log/errorf e "Error getting metadata for Segment %s: %s" segment-id (ex-message e))
      nil)))

(defn- tables [database-id metadata]
  (into []
        (comp (map deref)
              (filter (fn [table-metadata]
                        (= (:db_id table-metadata) database-id))))
        (vals @(:tables metadata))))

(defn- fields [metadata table-id]
  (into []
        (comp (map deref)
              (filter (fn [field-metadata]
                        (= (:table_id field-metadata) table-id))))
        (vals @(:fields metadata))))

(defn metadata-provider
  "Use a `metabase-lib/metadata/Metadata` as a [[metabase.lib.metadata.protocols/MetadataProvider]]."
  [database-id metadata]
  (let [metadata (metadata->clj metadata)]
    (log/debugf "metadata: %s" (pr-str metadata))
    (reify lib.metadata.protocols/MetadataProvider
      (database [_this]            (database metadata database-id))
      (table    [_this table-id]   (table    metadata table-id))
      (field    [_this field-id]   (field    metadata field-id))
      (metric   [_this metric-id]  (metric   metadata metric-id))
      (segment  [_this segment-id] (segment  metadata segment-id))
      (card     [_this card-id]    (card     metadata card-id))
      (tables   [_this]            (tables   database-id metadata))
      (fields   [_this table-id]   (fields   metadata table-id)))))
