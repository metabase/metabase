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

(declare load-one)

(defn- load-deps
  "Given a list of `deps` (hierarchies), `load-one` them all."
  [ctx deps]
  (if (empty? deps)
    ctx
    (reduce load-one ctx deps)))

(def ^:private dummy-models #{"Schema"})

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
                ;; Regenerate the hierarchy, since the one from the filesystem might have eg. sanitized file names.
                ;; Those suffice to look up the value, but it should be derived from the real value.
                rebuilt-hierarchy (serdes.base/serdes-hierarchy ingested)
                local-pk (serdes.base/load-find-local rebuilt-hierarchy)
                _        (serdes.base/load-one! ingested local-pk)]
            ctx)))

(defn load-metabase
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion]
  ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared dependencies guide
  ;; the import, and make sure all containers are imported before contents, etc.
  (let [contents (serdes.ingest/ingest-list ingestion)]
    (reduce load-one {:expanding #{}
                      :seen      #{}
                      :ingestion ingestion
                      :from-ids  (m/index-by :id contents)}
            contents)))

(comment
  (serdes.base/load-find-local [{:model "Database" :id "Sample Database"}
                                {:model "Schema"   :id "PUBLIC"}
                                {:model "Table"    :id "ORDERS"}])
  )
