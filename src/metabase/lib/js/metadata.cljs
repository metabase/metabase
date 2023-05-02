(ns metabase.lib.js.metadata
  (:require
   [clojure.core.protocols]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [goog]
   [goog.object :as gobject]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util :as lib.util]
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

(defn- object-get [obj k]
  (when obj
    (gobject/get obj k)))

(defn- obj->clj
  "Convert a JS object of *any* class to a ClojureScript object."
  [xform obj]
  (if (map? obj)
    ;; already a ClojureScript object.
    (into {} xform obj)
    ;; has a plain-JavaScript `_plainObject` attached: apply `xform` to it and call it a day
    (if-let [plain-object (some-> (object-get obj "_plainObject")
                                  js->clj
                                  not-empty)]
      (into {} xform plain-object)
      ;; otherwise do things the hard way and convert an arbitrary object into a Cljs map. (`js->clj` doesn't work on
      ;; arbitrary classes other than `Object`)
      (into {}
            (comp
             (map (fn [k]
                    [k (object-get obj k)]))
             ;; ignore values that are functions
             (remove (fn [[_k v]]
                       (= (goog/typeOf v) "function")))
             xform)
            (gobject/getKeys obj)))))

;;; this intentionally does not use the lib hierarchy since it's not dealing with MBQL/lib keys
(defmulti ^:private excluded-keys
  {:arglists '([object-type])}
  keyword)

(defmethod excluded-keys :default
  [_]
  nil)

;;; yes, the multimethod could dispatch on object-type AND k and get called for every object, but that would be slow,
;;; by doing it this way we only need to do it once.
(defmulti ^:private parse-field-fn
  "Return a function with the signature

    (f k v) => v'

  For parsing an individual field."
  {:arglists '([object-type])}
  keyword)

(defmethod parse-field-fn :default
  [_object-type]
  nil)

(defmulti ^:private lib-type
  "The metadata type that should be attached the sorts of metadatas with the `:lib/type` key, e.g. `:metadata/table`."
  {:arglists '([object-type])}
  keyword)

(defn- parse-object-xform [object-type]
  (let [excluded-keys-set (excluded-keys object-type)
        parse-field       (parse-field-fn object-type)]
    (comp
     ;; convert keys to kebab-case keywords
     (map (fn [[k v]]
            [(keyword (u/->kebab-case-en k)) v]))
     ;; remove [[excluded-keys]]
     (if (empty? excluded-keys-set)
       identity
       (remove (fn [[k _v]]
                 (contains? excluded-keys-set k))))
     ;; parse each key with its [[parse-field-fn]]
     (if-not parse-field
       identity
       (map (fn [[k v]]
              [k (parse-field k v)]))))))

(defn- parse-object-fn [object-type]
  (let [xform         (parse-object-xform object-type)
        lib-type-name (lib-type object-type)]
    (fn [object]
      (try
        (let [parsed (assoc (obj->clj xform object) :lib/type lib-type-name)]
          (log/debugf "Parsed metadata %s %s\n%s" object-type (:id parsed) (u/pprint-to-str parsed))
          parsed)
        (catch js/Error e
          (log/errorf e "Error parsing %s %s: %s" object-type (pr-str object) (ex-message e))
          nil)))))

(defmulti ^:private parse-objects
  {:arglists '([object-type metadata])}
  (fn [object-type _metadata]
    (keyword object-type)))

(defmulti ^:private parse-objects-default-key
  "Key to use to get unparsed objects of this type from the metadata, if you're using the default implementation
  of [[parse-objects]]."
  {:arglists '([object-type])}
  keyword)

(defmethod parse-objects :default
  [object-type metadata]
  (let [parse-object (parse-object-fn object-type)]
    (obj->clj (map (fn [[k v]]
                     [(parse-long k) (delay (parse-object v))]))
              (object-get metadata (parse-objects-default-key object-type)))))

(defmethod lib-type :database
  [_object-type]
  :metadata/database)

(defmethod excluded-keys :database
  [_object-type]
  #{:tables :fields})

(defmethod parse-field-fn :database
  [_object-type]
  (fn [k v]
    (case k
      :dbms-version       (js->clj v :keywordize-keys true)
      :features           (into #{} (map keyword) v)
      :native-permissions (keyword v)
      v)))

(defmethod parse-objects-default-key :database
  [_object-type]
  "databases")

(defmethod lib-type :table
  [_object-type]
  :metadata/table)

(defmethod excluded-keys :table
  [_object-type]
  #{:database :fields :segments :metrics :dimension-options})

(defmethod parse-field-fn :table
  [_object-type]
  (fn [k v]
    (case k
      :entity-type         (keyword v)
      :field-order         (keyword v)
      :initial-sync-status (keyword v)
      :visibility-type     (keyword v)
      v)))

(defmethod parse-objects :table
  [object-type metadata]
  (let [parse-table (parse-object-fn object-type)]
    (obj->clj (comp (remove (fn [[k _v]]
                              (str/starts-with? k "card__")))
                    (map (fn [[k v]]
                           [(parse-long k) (delay (parse-table v))])))
              (object-get metadata "tables"))))

(defmethod lib-type :field
  [_object-type]
  :metadata/field)

(defmethod excluded-keys :field
  [_object-type]
  #{:_comesFromEndpoint
    :database
    :default-dimension-option
    :dimension-options
    :dimensions
    :metrics
    :table})

(defmethod parse-field-fn :field
  [_object-type]
  (fn [k v]
    (case k
      :base-type         (keyword v)
      :coercion-strategy (keyword v)
      :effective-type    (keyword v)
      :fingerprint       (walk/keywordize-keys v)
      :has-field-values  (keyword v)
      :semantic-type     (keyword v)
      :visibility-type   (keyword v)
      v)))

(defmethod parse-objects-default-key :field
  [_object-type]
  "fields")

(defmethod lib-type :card
  [_object-type]
  :metadata/card)

(defmethod excluded-keys :card
  [_object-type]
  #{:database
    :dimension_options
    :table})

(defn- parse-fields [fields]
  (mapv (parse-object-fn :field) fields))

(defmethod parse-field-fn :card
  [_object-type]
  (fn [k v]
    (case k
      :result-metadata (if ((some-fn sequential? array?) v)
                         (parse-fields v)
                         (js->clj v :keywordize-keys true))
      :fields          (parse-fields v)
      :visibility-type (keyword v)
      :dataset-query   (js->clj v :keywordize-keys true)
      ;; this is not complete, add more stuff as needed.
      v)))

(defn- unwrap-card
  "Sometimes a card is stored in the metadata as some sort of weird object where the thing we actually want is under the
  key `_card` (not sure why), but if it is just unwrap it and then parse it normally."
  [obj]
  (or (object-get obj "_card")
      obj))

(defmethod parse-objects :card
  [object-type metadata]
  (let [parse-card (comp (parse-object-fn object-type) unwrap-card)]
    (merge
     (obj->clj (comp (filter (fn [[k _v]]
                               (str/starts-with? k "card__")))
                     (map (fn [[s v]]
                            (when-let [id (lib.util/string-table-id->card-id s)]
                              [id (delay (assoc (parse-card v) :id id))]))))
               (object-get metadata "tables"))
     (obj->clj (comp (map (fn [[k v]]
                            [(parse-long k) (delay (parse-card v))])))
               (object-get metadata "questions")))))

(defmethod lib-type :metric
  [_object-type]
  :metadata/metric)

(defmethod excluded-keys :metric
  [_object-type]
  #{:database :table})

(defmethod parse-field-fn :metric
  [_object-type]
  (fn [_k v]
    v))

(defmethod parse-objects-default-key :metric
  [_object-type]
  "metrics")

(defmethod lib-type :segment
  [_object-type]
  :metadata/segment)

(defmethod excluded-keys :segment
  [_object-type]
  #{:database :table})

(defmethod parse-field-fn :segment
  [_object-type]
  (fn [_k v]
    v))

(defmethod parse-objects-default-key :segment
  [_object-type]
  "segments")

(defn- parse-objects-delay [object-type metadata]
  (delay
    (try
      (parse-objects object-type metadata)
      (catch js/Error e
        (log/errorf e "Error parsing %s objects: %s" object-type (ex-message e))
        nil))))

(defn- parse-metadata [metadata]
  {:databases (parse-objects-delay :database metadata)
   :tables    (parse-objects-delay :table    metadata)
   :fields    (parse-objects-delay :field    metadata)
   :cards     (parse-objects-delay :card     metadata)
   :metrics   (parse-objects-delay :metric   metadata)
   :segments  (parse-objects-delay :segment  metadata)})

(defn- database [metadata database-id]
  (some-> metadata :databases deref (get database-id) deref))

(defn- table [metadata table-id]
  (some-> metadata :tables deref (get table-id) deref))

(defn- field [metadata field-id]
  (some-> metadata :fields deref (get field-id) deref))

(defn- card [metadata card-id]
  (some-> metadata :cards deref (get card-id) deref))

(defn- metric [metadata metric-id]
  (some-> metadata :metrics deref (get metric-id) deref))

(defn- segment [metadata segment-id]
  (some-> metadata :segments deref (get segment-id) deref))

(defn- tables [metadata database-id]
  (for [[_id table-delay]  (some-> metadata :tables deref)
        :let               [a-table (some-> table-delay deref)]
        :when              (and a-table (= (:db-id a-table) database-id))]
    a-table))

(defn- fields [metadata table-id]
  (for [[_id field-delay]  (some-> metadata :fields deref)
        :let               [a-field (some-> field-delay deref)]
        :when              (and a-field (= (:table-id a-field) table-id))]
    a-field))

(defn metadata-provider
  "Use a `metabase-lib/metadata/Metadata` as a [[metabase.lib.metadata.protocols/MetadataProvider]]."
  [database-id unparsed-metadata]
  (let [metadata (parse-metadata unparsed-metadata)]
    (log/debug "Created metadata provider for metadata")
    (reify lib.metadata.protocols/MetadataProvider
      (database [_this]            (database metadata database-id))
      (table    [_this table-id]   (table    metadata table-id))
      (field    [_this field-id]   (field    metadata field-id))
      (metric   [_this metric-id]  (metric   metadata metric-id))
      (segment  [_this segment-id] (segment  metadata segment-id))
      (card     [_this card-id]    (card     metadata card-id))
      (tables   [_this]            (tables   metadata database-id))
      (fields   [_this table-id]   (fields   metadata table-id))

      ;; for debugging: call [[clojure.datafy/datafy]] on one of these to parse all of our metadata and see the whole
      ;; thing at once.
      clojure.core.protocols/Datafiable
      (datafy [_this]
        (walk/postwalk
         (fn [form]
           (if (delay? form)
             (deref form)
             form))
         metadata)))))
