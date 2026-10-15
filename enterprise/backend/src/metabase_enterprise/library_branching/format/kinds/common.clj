(ns metabase-enterprise.library-branching.format.kinds.common
  "A codec of one kind, built from a spec: the document keys of the name and the place, a closed set of attributes
  with their schemas and defaults, the attribute forms that encode and decode change, the references, and the layout
  data. Every attribute value is a document value: the JSON form, with keyword keys and keyword values as strings."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Document values -------------------------------------------------

(defn- document-key?
  [k]
  (and (keyword? k) (= k (keyword (subs (str k) 1)))))

(defn document?
  "True iff `x` is a value of the document model that the YAML reader gives back equal: nil, a string, a boolean, an
  integer, a finite double, a vector of document values, or a map from keywords to document values. A set, a list, a
  keyword value and a keyword that reads back as another keyword (`(keyword \"a/b\" \"c\")`) are not."
  [x]
  (cond
    (map? x)    (every? (fn [[k v]] (and (document-key? k) (document? v))) x)
    (vector? x) (every? document? x)
    (or (nil? x) (string? x) (boolean? x) (int? x)
        (instance? clojure.lang.BigInt x)
        (instance? java.math.BigInteger x)) true
    (double? x) (Double/isFinite x)
    :else       false))

(registry/def ::document
  [:fn {:error/message "a document value"} document?])

(registry/def ::document-map
  [:and [:map-of :keyword :any] ::document])

(registry/def ::document-vector
  [:and [:vector :any] ::document])

;;; ---------------------------------------------------- Attributes ---------------------------------------------------

(defn at-default?
  "True iff `v` is the default of attribute `k` of `spec`: its `:default`, else nil. A required attribute has no
  default."
  [spec k v]
  (let [{:keys [required? default]} (get-in spec [:attrs k])]
    (and (not required?) (= default v))))

(defn drop-defaults
  "`attrs` without each attribute at its default."
  [spec attrs]
  (into {} (remove (fn [[k v]] (at-default? spec k v))) attrs))

(defn- attrs-schema
  [{:keys [attrs] :as spec}]
  (into [:map {:closed true}]
        (for [[k {:keys [schema required?]}] (sort-by key attrs)]
          [k {:optional (not required?)}
           [:and
            schema
            ::document
            [:fn {:error/message "an attribute at its default is not in :attrs"} #(not (at-default? spec k %))]]])))

;;; ------------------------------------------------------ Items ------------------------------------------------------

(defn- reserved-keys
  [{:keys [name-key place-key]}]
  (cond-> #{:kind :id name-key}
    place-key (conj place-key)))

(defn refs-of
  "The references of the item of `spec` with identity `id` and attributes `attrs`."
  [spec id attrs]
  ((:refs spec) id attrs))

(defn refs-consistent?
  "True iff the `:refs` of `item` are the references of its attributes, with the identity that `(:refs-id spec)`
  finds in `item` (nil when the spec has no `:refs-id`)."
  [spec {:keys [refs attrs] :as item}]
  (let [id (when-let [f (:refs-id spec)] (f item))]
    (= refs (refs-of spec id attrs))))

(defn item-schema
  "The schema of the items of `spec`: a closed map, with `:place` of the spec's `:place-schema` (default a container
  identity or nil, and nil for a spec with no place key), the closed attributes of the spec, and the references of
  the attributes as `:refs`; and each schema of the spec's `:checks` on the whole item."
  [{:keys [name-schema place-key place-schema checks] :as spec}]
  (into [:and
         [:map {:closed true}
          [:kind [:= (:kind spec)]]
          [:name (or name-schema [:string {:min 1}])]
          [:place (or place-schema (if place-key [:maybe ::snapshot/entity-id] :nil))]
          [:refs [:set ::snapshot/ref]]
          [:attrs (attrs-schema spec)]]
         [:fn {:error/message "the references are not those of the attributes"} #(refs-consistent? spec %)]]
        checks))

(defn encode-item
  "The document of `item` of `spec`, whose identity is `id`."
  [{:keys [kind name-key place-key encode-attrs]} id {:keys [name place attrs]}]
  (cond-> (merge ((or encode-attrs identity) attrs)
                 {:kind (clojure.core/name kind) :id id name-key name})
    (some? place) (assoc place-key place)))

(defn decode-doc
  "`[id item]` of document `doc` of the kind of `spec`. An absent attribute, or one at its default, is not in
  `:attrs`. Throws ::codec/invalid for a key that is not of the kind, an identity of another form, or a name that is
  not a non-empty string."
  [{:keys [kind name-key place-key attrs id-schema decode-attrs] :as spec} doc]
  (let [unknown (sort (remove (into (reserved-keys spec) (keys attrs)) (keys doc)))]
    (when (seq unknown)
      (codec/invalid! (str "Keys that are not attributes of the kind " (clojure.core/name kind) ": "
                           (str/join ", " (map #(subs (str %) 1) unknown))))))
  (let [id (:id doc)
        nm (get doc name-key)]
    (when-not (registry/validate id-schema id)
      (codec/invalid! (str "The id is not an identity of the kind " (clojure.core/name kind) ": " (pr-str id))))
    (when-not (and (string? nm) (seq nm))
      (codec/invalid! (str "The item has no " (clojure.core/name name-key) ".")))
    (let [a (drop-defaults spec ((or decode-attrs identity) (select-keys doc (keys attrs))))]
      [id {:kind  kind
           :name  nm
           :place (when place-key (get doc place-key))
           :refs  (refs-of spec id a)
           :attrs a}])))

(defn codec
  "The `codec/Codec` and `layout/Layout` of `spec`, whose items have the registered schema `schema-key` (made by
  [[item-schema]]). The identity is the document key `id`. A spec:

    {:kind         :metric
     :word         \"metric\"              ; layout/word
     :directory?   false                  ; layout/directory?
     :home         f                      ; (f item): layout/home
     :id-schema    ::snapshot/entity-id   ; the identities of the kind
     :name-key     :name                  ; the document key of the item's :name
     :name-schema  s                      ; optional: the schema of the :name; a non-empty string by default
     :place-key    :collection            ; the document key of the item's :place; nil: every item is at the root level
     :attrs        {k {:schema s :default d :required? b}}
     :encode-attrs f                      ; optional: (f attrs), the attribute part of the document
     :decode-attrs f                      ; optional: its inverse
     :refs         f                      ; (f id attrs): the item's :refs
     :refs-id      f                      ; optional: (f item), the identity that :refs needs, for the schema
     :place-schema s                      ; optional: the schema of :place; default an entity id or nil
     :checks       [s ...]}               ; optional: more schemas of the whole item

  Throws when an attribute key is `:kind`, `:id`, the name key or the place key."
  [{:keys [kind word directory? attrs] :as spec} schema-key]
  (when-let [clash (seq (filter (reserved-keys spec) (keys attrs)))]
    (throw (ex-info (str "Attributes that are reserved keys: " (pr-str clash)) {:kind kind :keys clash})))
  (reify
    codec/Codec
    (kind [_] kind)
    (encode [_ id item] (encode-item spec id item))
    (decode [_ doc] (decode-doc spec doc))
    (schema [_] schema-key)

    layout/Layout
    (word [_] word)
    (directory? [_] directory?)
    (home [_ item] ((:home spec) item))))
