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
  (when (and obj (js-in k obj))
    (gobject/get obj k)))

(defn- obj->clj
  "Convert a JS object of *any* class to a ClojureScript object."
  ([xform obj]
   (obj->clj xform obj {}))
  ([xform obj {:keys [use-plain-object?] :or {use-plain-object? true}}]
   (if (map? obj)
     ;; already a ClojureScript object.
     (into {} xform obj)
     ;; has a plain-JavaScript `_plainObject` attached: apply `xform` to it and call it a day
     (if-let [plain-object (when use-plain-object?
                             (some-> (object-get obj "_plainObject")
                                     js->clj
                                     not-empty))]
       (into {} xform plain-object)
       ;; otherwise do things the hard way and convert an arbitrary object into a Cljs map. (`js->clj` doesn't work on
       ;; arbitrary classes other than `Object`)
       (into {}
             (comp
              (map (fn [k]
                     [k (object-get obj k)]))
              ;; ignore values that are functions
              (remove (fn [[_k v]]
                        (js-fn? v)))
              xform)
             (js-keys obj))))))

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

(defmulti ^:private rename-key-fn
  "Returns a function of the keys, either renaming each one or preserving it.
  If this function returns nil for a given key, the original key is preserved.
  Use [[excluded-keys]] to drop keys from the input.

  Defaults to nil, which means no renaming is done."
  identity)

(defmethod rename-key-fn :default [_]
  nil)

(defn- parse-object-xform [object-type]
  (let [excluded-keys-set (excluded-keys object-type)
        parse-field       (parse-field-fn object-type)
        rename-key        (rename-key-fn object-type)]
    (comp
     ;; convert keys to kebab-case keywords
     (map (fn [[k v]]
            [(cond-> (keyword (u/->kebab-case-en k))
               rename-key (#(or (rename-key %) %)))
             v]))
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

(defn- parse-object-fn
  ([object-type]
   (parse-object-fn object-type {}))
  ([object-type opts]
   (let [xform         (parse-object-xform object-type)
         lib-type-name (lib-type object-type)]
     (fn [object]
       (try
         (let [parsed (assoc (obj->clj xform object opts) :lib/type lib-type-name)]
           (log/debugf "Parsed metadata %s %s\n%s" object-type (:id parsed) (u/pprint-to-str parsed))
           parsed)
         (catch js/Error e
           (log/errorf e "Error parsing %s %s: %s" object-type (pr-str object) (ex-message e))
           nil))))))

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
  :metadata/column)

(defmethod excluded-keys :field
  [_object-type]
  #{:_comesFromEndpoint
    :database
    :default-dimension-option
    :dimension-options
    :dimensions
    :metrics
    :table})

(defmethod rename-key-fn :field
  [_object-type]
  {:source          :lib/source
   :unit            :metabase.lib.field/temporal-unit
   :expression-name :lib/expression-name
   :binning-info    :metabase.lib.field/binning})

(defn- parse-field-id
  [id]
  (cond-> id
    ;; sometimes instead of an ID we get a field reference
    ;; with the name of the column in the second position
    (vector? id) second))

(defn- parse-binning-info
  [m]
  (obj->clj
   (map (fn [[k v]]
          (let [k (keyword (u/->kebab-case-en k))
                k (if (= k :binning-strategy)
                    :strategy
                    k)
                v (if (= k :strategy)
                    (keyword v)
                    v)]
            [k v])))
   m))

(defmethod parse-field-fn :field
  [_object-type]
  (fn [k v]
    (case k
      :base-type                        (keyword v)
      :coercion-strategy                (keyword v)
      :effective-type                   (keyword v)
      :fingerprint                      (if (map? v)
                                          (walk/keywordize-keys v)
                                          (js->clj v :keywordize-keys true))
      :has-field-values                 (keyword v)
      :lib/source                       (case v
                                          "aggregation" :source/aggregations
                                          "breakout"    :source/breakouts
                                          (keyword "source" v))
      :metabase.lib.field/temporal-unit (keyword v)
      :semantic-type                    (keyword v)
      :visibility-type                  (keyword v)
      :id                               (parse-field-id v)
      :metabase.lib.field/binning       (parse-binning-info v)
      v)))

(defmethod parse-objects :field
  [object-type metadata]
  (let [parse-object (parse-object-fn object-type)
        unparsed-fields (object-get metadata "fields")]
    (obj->clj (keep (fn [[k v]]
                      ;; Sometimes fields coming from saved questions are only present with their ID
                      ;; prefixed with "card__<card-id>:". For such keys we parse the field ID from
                      ;; the suffix and use the entry unless the ID is present in the metadata without
                      ;; prefix. (The assumption being that the data under the two keys are mostly the
                      ;; same but the one under the plain key is to be preferred.)
                      (when-let [field-id (or (parse-long k)
                                              (when-let [[_ id-str] (re-matches #"card__\d+:(\d+)" k)]
                                                (and (nil? (object-get unparsed-fields id-str))
                                                     (parse-long id-str))))]
                        [field-id (delay (parse-object v))])))
              unparsed-fields)))

(defmethod lib-type :card
  [_object-type]
  :metadata/card)

(defmethod excluded-keys :card
  [_object-type]
  #{:database
    :db
    :dimension-options
    :fks
    :metadata
    :metrics
    :plain-object
    :segments
    :schema
    :schema-name
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
      :dataset         v
      ;; this is not complete, add more stuff as needed.
      v)))

(defn- unwrap-card
  "Sometimes a card is stored in the metadata as some sort of weird object where the thing we actually want is under the
  key `_card` (not sure why), but if it is just unwrap it and then parse it normally."
  [obj]
  (or (object-get obj "_card")
      obj))

(defn- assemble-card
  [metadata id]
  (let [parse-card-ignoring-plain-object (parse-object-fn :card {:use-plain-object? false})
        parse-card (parse-object-fn :card)]
    ;; The question objects might not contain the fields so we merge them
    ;; in from the table matadata.
    (merge
     (-> metadata
         (object-get "tables")
         (object-get (str "card__" id))
         ;; _plainObject can contain field names in the field property
         ;; instead of the field objects themselves.  Ignoring this
         ;; property makes sure we parse the real fields.
         parse-card-ignoring-plain-object
         (assoc :id id))
     (-> metadata
         (object-get "questions")
         (object-get (str id))
         unwrap-card
         parse-card))))

(defmethod parse-objects :card
  [_object-type metadata]
  (into {}
        (map (fn [id]
               [id (delay (assemble-card metadata id))]))
        (-> #{}
            (into (keep lib.util/legacy-string-table-id->card-id)
                  (js-keys (object-get metadata "tables")))
            (into (map parse-long)
                  (js-keys (object-get metadata "questions"))))))

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
  (for [[_id table-delay] (some-> metadata :tables deref)
        :let              [a-table (some-> table-delay deref)]
        :when             (and a-table (= (:db-id a-table) database-id))]
    a-table))

(defn- fields [metadata table-id]
  (for [[_id field-delay] (some-> metadata :fields deref)
        :let              [a-field (some-> field-delay deref)]
        :when             (and a-field (= (:table-id a-field) table-id))]
    a-field))

(defn- metrics [metadata table-id]
  (for [[_id metric-delay] (some-> metadata :metrics deref)
        :let               [a-metric (some-> metric-delay deref)]
        :when              (and a-metric (= (:table-id a-metric) table-id))]
    a-metric))

(defn- segments [metadata table-id]
  (for [[_id segment-delay] (some-> metadata :segments deref)
        :let               [a-segment (some-> segment-delay deref)]
        :when              (and a-segment (= (:table-id a-segment) table-id))]
    a-segment))

(defn- setting [setting-key unparsed-metadata]
  (if (and js/describe js/it)
    ;; Trust the metadata's settings in tests.
    (-> unparsed-metadata
        (.-settings)
        (aget (name setting-key)))
    ;; And use the global, async-updated one in prod.
    (.get js/__metabaseSettings (name setting-key))))

(defn metadata-provider
  "Use a `metabase-lib/metadata/Metadata` as a [[metabase.lib.metadata.protocols/MetadataProvider]]."
  [database-id unparsed-metadata]
  (let [metadata (parse-metadata unparsed-metadata)]
    (log/debug "Created metadata provider for metadata")
    (reify lib.metadata.protocols/MetadataProvider
      (database [_this]             (database metadata database-id))
      (table    [_this table-id]    (table    metadata table-id))
      (field    [_this field-id]    (field    metadata field-id))
      (metric   [_this metric-id]   (metric   metadata metric-id))
      (segment  [_this segment-id]  (segment  metadata segment-id))
      (card     [_this card-id]     (card     metadata card-id))
      (tables   [_this]             (tables   metadata database-id))
      (fields   [_this table-id]    (fields   metadata table-id))
      (metrics  [_this table-id]    (metrics  metadata table-id))
      (segments [_this table-id]    (segments metadata table-id))
      (setting  [_this setting-key] (setting  setting-key unparsed-metadata))

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

(def parse-column
  "Parses a JS column provided by the FE into a :metadata/column value for use in MLv2."
  (parse-object-fn :field))
