(ns metabase-enterprise.representations.v0.common
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti type->model
  "Conversion from representation type (keyword) to Toucan model keyword."
  {:arglists '([type])}
  identity)

(defmethod type->model :default
  [type]
  (throw (ex-info (str "Cannot convert type to model for type: " type)
                  {:type type})))

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

(defn add-entity-id-from-ref-hash
  "Add a stable entity-id to a representation based on its ref and collection ref."
  [representation]
  (assoc representation :entity-id (generate-entity-id representation)))

(defn add-entity-id-random
  "Add an unstable entity-id to a representation. It should be random so that it never collides."
  [representation]
  (assoc representation :entity-id (u/generate-nano-id)))

(defn remove-entity-id
  "Remove the entity id from a representation (if it has one)."
  [representation]
  (dissoc representation :entity-id))

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
  [representation]
  (let [v (volatile! [])]
    (walk/postwalk (fn [node]
                     (when (ref? node)
                       (vswap! v conj node))
                     node)
                   representation)
    (set (map unref @v))))

(defn ->ref
  "Constructs a ref with the shape \"ref:<type>-<id>\""
  [id type]
  (format "ref:%s-%s" (name type) id))

(defn env-var?
  "Is it an env var?

   Env vars are useful for storing credentials for databases in representations. They are expanded during import."
  [s]
  (and (string? s)
       (str/starts-with? s "env:")))

(defn un-env-var
  "Turn env var string into an env var name."
  [s]
  (when (env-var? s)
    ;; "env:"
    (subs s 4)))

(defn hydrate-env-vars
  "Given a representation, hydrate all env vars with their values looked up from the environment."
  [representation]
  (walk/postwalk (fn [x]
                   (if (env-var? x)
                     (System/getenv (un-env-var x))
                     x))
                 representation))

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
  [representation]
  (let [v (volatile! #{})]
    (walk/postwalk (fn [node]
                     (when (or (table-ref? node)
                               (field-ref? node))
                       (vswap! v conj (dissoc node :field)))
                     node)
                   representation)
    @v))
