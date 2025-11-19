(ns metabase-enterprise.representations.v0.common
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti representation-type
  "Returns the representation type (e.g., :question, :model, :metric) for a toucan entity.

  Dispatches on the toucan model type."
  {:arglists '[[entity]]}
  t2/model)

(defmethod representation-type :default [entity]
  (throw (ex-info (str "Unknown entity type: " (t2/model entity))
                  {:entity entity})))

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
  (entity-id (:name representation) (:collection representation)))

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
       (contains? x :schema)
       (contains? x :table)
       (not (contains? x :field))))

(defn field-ref?
  "Is this a field ref?"
  [x]
  (and (map? x)
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
                       (vswap! v conj (cond-> (dissoc node :field)
                                        (not (contains? node :database))
                                        (assoc :database (:database representation)))))
                     node)
                   representation)
    @v))

(defprotocol EntityLookup
  (lookup-entity [this ref])
  (lookup-id [this ref]))

(defrecord MapEntityIndex [idx]
  EntityLookup
  (lookup-entity [_this ref]
    (get idx (unref ref)))
  (lookup-id [this ref]
    (:id (lookup-entity this ref))))

(defn map-entity-index
  "Create a new index from a map of ref -> toucan entity."
  [mp]
  (->MapEntityIndex mp))

(defn ensure-not-nil
  "Validates that an entity is not nil. Throws an exception if nil, otherwise returns the entity."
  [entity]
  (when (nil? entity)
    (throw (ex-info "Entity not found." {})))
  entity)

(defn ensure-correct-type
  "Ensures the entity is of the expected representation type. Throws if not."
  [entity expected-type]
  (when (and entity
             (not= expected-type (representation-type entity)))
    (throw (ex-info (str "Entity is not the correct type. Expected: " expected-type "; Actual: " (representation-type entity))
                    {:entity entity
                     :expected-type expected-type
                     :actual-type (representation-type entity)})))
  entity)

(defn entity->ref
  "Get the internal ref for a toucan entity."
  [t2-entity]
  (->ref (:id t2-entity) (representation-type t2-entity)))

(defn id-model->ref
  "Get the internal ref for a toucan model and id by fetching the entity from the database.
   Returns a reference string in the format expected by the representation system."
  [id model]
  (entity->ref (t2/select-one model id)))

(defn ensure-correct-model-type
  "Validates that an entity has the expected Toucan model type.
   Throws an exception if the model type doesn't match, otherwise returns the entity."
  [entity expected-type]
  (when (not= expected-type (t2/model entity))
    (throw (ex-info (str "Entity is not the correct model type. Expected: " expected-type "; Actual: " (t2/model entity))
                    {:entity entity
                     :expected-type expected-type
                     :actual-type (t2/model entity)})))
  entity)

(defn replace-refs-everywhere
  "Replace all refs with whatever is in the ref-index."
  [data ref-index]
  (walk/postwalk
   (fn [node]
     (if (ref? node)
       (lookup-id ref-index node)
       node))
   data))

(defn cleanup-delete-before-output
  "Delete a special key used to keep structured data around until export."
  [data]
  (walk/postwalk
   (fn [node]
     (if (map? node)
       (dissoc node ::delete-before-output)
       node))
   data))

(defn order-representations
  "Order representations topologically by ref dependency"
  [representations]
  (loop [iterations (count representations) ;; should take at most one iteration per representation
         acc []
         remaining (set representations)]
    (cond
      (empty? remaining) ;; we're done!
      acc

      (neg? iterations) ;; we've used too many iterations, probably in a cycle
      (throw (ex-info "Used too many iterations. Cycle?"
                      {:representations representations}))

      :else
      (let [done (set (map :name acc))
            ready (filter #(set/subset? (refs %) done)
                          remaining)
            acc' (into acc ready)
            next-remaining (set/difference remaining (set acc'))]
        (when (= remaining next-remaining)
          (throw (ex-info "No progress made. Cycle?"
                          {:representations representations})))
        (recur (dec iterations) acc' next-remaining)))))
