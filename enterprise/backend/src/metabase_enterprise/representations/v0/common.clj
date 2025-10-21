(ns metabase-enterprise.representations.v0.common
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def type->model
  "Map from representation type strings to Toucan model keywords.

  Representation types are human-readable identifiers used in YAML files,
  while model keywords are used internally by Toucan for database operations."
  {"question" :model/Card
   "metric" :model/Card
   "model" :model/Card
   "document" :model/Document
   "database" :model/Database
   "transform" :model/Transform
   "snippet" :model/NativeQuerySnippet})

(defn entity-id
  "Generates an entity-id stably from ref and collection-ref."
  [ref collection-ref]
  (-> (str collection-ref "/" ref)
      hash
      str
      u/generate-nano-id))

(defn generate-entity-id
  "Generate a stable entity-id from the representation's collection-ref and its own ref."
  [representation]
  ;; Behold the beauty of this mechanism!
  ;; A bit hacky.
  ;; TODO: raw `:collection` key could be fragile; use name?
  (entity-id (:ref representation) (:collection representation)))

(defn find-collection-id
  "Find collection ID by name or ref. Returns nil if not found."
  [collection-ref]
  (when collection-ref
    (or
     (when (integer? collection-ref) collection-ref)
     ;; Try to find by slug or name
     (t2/select-one-pk :model/Collection :slug collection-ref)
     (t2/select-one-pk :model/Collection :name collection-ref))))

(defn ref?
  "Is it a ref?"
  [x]
  (and (string? x)
       (str/starts-with? x "ref:")))

(defn unref
  "Unmake that ref."
  [x]
  (when (ref? x)
    ;; "ref:"
    (subs x 4)))

(defn refs
  "Returns all refs present in the entity-map, recursively walking to discover them."
  [entity]
  (case (:type entity)
    :document
    (let [refs (re-seq #"ref:\S+" (:content entity))]
      (set (map unref refs)))
    (let [v (volatile! [])]
      (walk/postwalk (fn [node]
                       (when (ref? node)
                         (vswap! v conj node))
                       node)
                     (dissoc entity :ref))
      (set (map unref @v)))))

(defn ->ref
  "Constructs a ref with the shape \"ref:<type>-<id>\""
  [id type]
  (format "ref:%s-%s" (name type) id))

(defn hydrate-env-var
  "If it begins with \"env:\", hydrates...?"
  [x]
  (when (and (string? x)
             (str/starts-with? x "env:"))
    (subs x 4)))

(defn- ref->id*
  [entity-ref ref-index]
  (cond
    (integer? entity-ref)
    entity-ref

    (ref? entity-ref)
    (->> (unref entity-ref)
         (get ref-index)
         :id)))

(defn ref->id
  "Find ID by name or ref. Returns nil if not found."
  [entity-ref ref-index]
  (or (ref->id* entity-ref ref-index)
      (throw
       (ex-info "Could not process entity ref!"
                {:entity-ref entity-ref
                 :ref-index ref-index}))))

(defn resolve-database-id
  "Finds database-id, either by finding it in the ref-index or by looking it up by name.
  `database-ref` can be one of:
   - integer: assumed to be ID
   - ref: we look it up in the ref-index
   - string: we assume this is database-name and try to find it"
  [database-ref ref-index]
  (or (ref->id* database-ref ref-index)
      (when (string? database-ref)
        (t2/select-one-pk :model/Database :name database-ref))
      (throw (ex-info "Could not resolve database!"
                      {:database-ref database-ref
                       :ref-index ref-index}))))

(def representations-export-dir
  "The dir where POC import/export representations are stored."
  "local/representations/")

(defn file-sys-name
  "Creates a suitable filename."
  [id name suffix]
  (str id "_" (str/replace (u/lower-case-en name) " " "_") suffix))

(defn table-ref?
  "Is this a table ref?"
  [x]
  (and (map? x)
       (contains? x :database)
       (contains? x :schema)
       (contains? x :table)
       (not (contains? x :field))))

(defn field-ref?
  "Is this a field ref?"
  [x]
  (and (map? x)
       (contains? x :database)
       (contains? x :schema)
       (contains? x :table)
       (contains? x :field)))

(defn table-refs
  "Returns all table refs present in the representation, recursively walking to discover them."
  [entity]
  (let [v (volatile! [])]
    (walk/postwalk (fn [node]
                     (when (or (table-ref? node)
                               (field-ref? node))
                       (vswap! v conj node))
                     node)
                   entity)
    (into #{} (map #(dissoc % :field)) @v)))
