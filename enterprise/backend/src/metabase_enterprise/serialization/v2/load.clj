(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require [medley.core :as m]
            [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
            [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase.models.serialization.base :as serdes.base]
            [toucan.db :as db]))

(defn- load-prescan-model [model]
  (transduce (map (fn [[eid ih pk]]
                    {:by-entity-id     [eid pk]
                     :by-identity-hash [ih pk]}))
             (partial merge-with conj)
             {:by-entity-id {} :by-identity-hash {}}
             (serdes.base/load-prescan-all model)))

(defn- load-prescan
  "For all the exported models in the list, run the prescan process."
  []
  (into {} (for [model serdes.models/exported-models]
             [model (load-prescan-model model)])))

;; These are on ice for now; they'll be dusted off as the YAML storage/ingestion code is added in a later PR.
;; (defn- path-parts [path]
;;   (->> (java.nio.file.Paths/get path (into-array String []))
;;        (.iterator)
;;        (iterator-seq)
;;        (map str)))
;;
;; (defn- id-from-path [path]
;;   (let [^String file (last (path-parts path))
;;         base         (.substring file 0 (.lastIndexOf file "."))
;;         ; Things with human-readable names use the form identity_hash+human_name.yaml
;;         plus         (.indexOf base "+")]
;;     (if (< plus 0)
;;       base
;;       (.substring base 0 plus))))

(declare load-one)

(defn- load-deps
  "Given a list of `deps` (raw IDs), convert it to a list of meta-maps and `load-one` them all."
  [ctx deps]
  (if (empty? deps)
    ctx
    (reduce load-one ctx (map (:from-ids ctx) deps))))

(defn- load-one
  "Loads a single meta-map into the appdb, doing the necessary bookkeeping.

  If the incoming entity has any dependencies, they are processed first (postorder) so that any foreign key references
  in this entity can be resolved properly.

  This is mostly bookkeeping for the overall deserialization process - the actual load of any given entity is done by
  [[metabase.models.serialization.base/load-one!]] and its various overridable parts, which see.

  Circular dependencies are not allowed, and are detected and thrown as an error."
  [{:keys [expanding ingestion seen] :as ctx} {:keys [id type] :as meta-map}]
  (cond
    (expanding id) (throw (ex-info (format "Circular dependency on %s %s" type id) {}))
    (seen id)      ctx ; Already been done, just skip it.
    :else (let [ingested (serdes.ingest/ingest-one ingestion meta-map)
                model    (db/resolve-model (symbol type))
                deps     (serdes.base/serdes-dependencies ingested)
                ctx'     (-> ctx
                             (update :expanding conj id)
                             (load-deps deps)
                             (update :seen conj id)
                             (update :expanding disj id))
                pk       (serdes.base/load-one!
                           ingested
                           (or (get-in ctx' [:local (name model) :by-entity-id id])
                               (get-in ctx' [:local (name model) :by-identity-hash id])))]
            (assoc-in ctx' [:local
                            (name model)
                            (if (serdes.base/entity-id? id) :by-entity-id :by-identity-hash)
                            id]
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
