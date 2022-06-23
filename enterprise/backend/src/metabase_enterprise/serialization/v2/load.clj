(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require [medley.core :as m]
            [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
            [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [toucan.db :as db]
            [toucan.models :as models]))

(defn- update-local [local [{:keys [model id]} & tail] eid ih new-pk]
  (if (empty? tail)
    ;; We've reach the bottom, update this map here.
    (cond-> local
      eid (assoc-in [model :by-entity-id     eid] new-pk)
      ih  (assoc-in [model :by-identity-hash ih]  new-pk))

    ;; If there's still more nesting to go, recurse in.
    (let [pk (or (get-in local [model :by-entity-id id])
                 (get-in local [model :by-identity-hash id]))]
      (update-in local [model :children pk] update-local tail eid ih new-pk))))

(defn- load-prescan-model [local {:keys [hierarchy entity_id identity-hash primary-key]}]
  (update-local local hierarchy entity_id identity-hash primary-key))

;; The map is shaped like this:
;; {"Database"  {:by-primary-key   {1 {"Table" {:by-entity-id {"76543" 12}}}}
;;               :by-entity-id     {"12345" 1}
;;               :by-identity-hash {"df12" 1}}
;;  "Table" {:by-primary-key {12 {"Field" {:by-entity-id {"99" 60}}}}}
;;  "Field" {:by-primary-key '...}}
;; This normalization helps to keep it easy to update as new entities are scanned; there's a 

(defn- load-prescan
  "For all the exported models in the list, run the prescan process."
  []
  (transduce (mapcat serdes.base/load-prescan-all) (completing load-prescan-model) {} serdes.models/exported-models))

(declare load-one)

(defn- load-deps
  "Given a list of `deps` (hierarchies), `load-one` them all."
  [ctx deps]
  (if (empty? deps)
    ctx
    (reduce load-one ctx deps)))

(def ^:private dummy-models #{"Schema"})

(defn- find-local [local [{:keys [model id]} & tail]]
  ;; The nesting of the locals table goes like this:
  ;; {"Database" {:by-primary-key   {1 {"Field" {...}}}
  ;;              :by-entity-id     {"my-db" 1}
  ;;              :by-identity-hash {"123456" 1}}}
  (let [pk (or (get-in local [model :by-entity-id id])
               (get-in local [model :by-identity-hash id])
               (when (dummy-models model) id))]
    (if (empty? tail)
      ;; We've reached the bottom: load this Toucan entity by its primary key.
      ((db/resolve-model (symbol model)) pk)
      ;; Still more nesting. Continue into the children map.
      (recur (get-in local [model :by-primary-key pk]) tail))))

(defn- load-one
  "Loads a single entity, specified by its meta-map hierarchy into the appdb, doing the necessary bookkeeping.

  If the incoming entity has any dependencies, they are processed first (postorder) so that any foreign key references
  in this entity can be resolved properly.

  This is mostly bookkeeping for the overall deserialization process - the actual load of any given entity is done by
  [[metabase.models.serialization.base/load-one!]] and its various overridable parts, which see.

  Circular dependencies are not allowed, and are detected and thrown as an error."
  [{:keys [expanding ingestion seen] :as ctx} hierarchy]
  (cond
    (expanding hierarchy) (throw (ex-info (format "Circular dependency on %s" (pr-str hierarchy)) {}))
    (seen hierarchy)      ctx ; Already been done, just skip it.
    :else (let [ingested (serdes.ingest/ingest-one ingestion hierarchy)
                ;model    (db/resolve-model (symbol model-name))
                deps     (serdes.base/serdes-dependencies ingested)
                ctx      (-> ctx
                             (update :expanding conj hierarchy)
                             (load-deps deps)
                             (update :seen conj hierarchy)
                             (update :expanding disj hierarchy))
                local    (find-local (:local ctx) hierarchy)
                pk       (serdes.base/load-one!
                           ingested
                           (get local (models/primary-key local)))]
            (update ctx :local
                    update-local hierarchy
                    (serdes.base/serdes-entity-id (name local) ingested)
                    (serdes.hash/identity-hash local)
                    pk))))

(defn load-metabase
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion]
  ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared dependencies guide
  ;; the import, and make sure all containers are imported before contents, etc.
  (let [contents (serdes.ingest/ingest-list ingestion)]
    (reduce load-one {:local     (load-prescan)
                      :expanding #{}
                      :seen      #{}
                      :ingestion ingestion
                      :from-ids  (m/index-by :id contents)}
            contents)))

(comment
  ;; START HERE The prescan/local check piece needs a complete rebuild.
  ;; The actual objective is, given the entity (and hierachy) of an incoming value, do we have a corresponding one in this
  ;; appdb?
  ;; In general, that can be answered by logic like this:
  ;; - If the ID is NanoID shaped, look it up by that index.
  ;; - If not (or not found), look it up by identity-hash.
  ;; - The identity hashes could be cached in some memoized scheme, to avoid repeatedly scanning the whole table.
  ;; Put that in a multimethod keyed by the model, which allows Table and Field to override it with their own, hierarchy
  ;; based logic. They have to deal with hierarchies (and Schemas), but also they don't have to fret about identity
  ;; hashes, because the databases, tables and fields already have human-selected names.
  ;; That also gives a nice plug-in point for database-engine specific logic around table namespacing.
  ;;
  ;; I think that will work, and replace nearly all of this prescan code, which will move into lazily-applied
  ;; default.
  ;;
  (serdes.base/load-prescan-one (db/resolve-model 'Table) (into {} (db/select-one 'Table :id 1))
                                #_(assoc (into {} (db/select-one 'Table :id 1)) :serdes/meta {:model "Table" :id "PRODUCTS"}))
  (load-prescan))
