(ns metabase-enterprise.serialization.v2.dependency-validation
  "Export-time dependency validation for serialization.

  Before an export is written, every entity it takes is checked to make sure all of its references are satisfiable in
  the resulting archive: content references (Cards, Dashboards, …) must themselves be part of the export, and
  data-model references (Database, Table, Field) must exist in the source app DB. An unsatisfied reference would
  otherwise become a dangling reference in the archive, breaking the import. The references come from
  [[metabase.serialization.core/export-dependencies]]."
  (:require
   [medley.core :as m]
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase-enterprise.serialization.v2.select :as select]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- collection-label [coll-id]
  (if coll-id
    (str coll-id)
    "[no collection]"))

(defn- entity-label [[model id]]
  (let [entity (serialization.db/collection-id-row model id)]
    (format "%s %d (from collection %s)" (name model) id (collection-label (:collection_id entity)))))

(defn- escaping-dependencies
  "The references of the content entities `by-model`, a map of model to ids, as an export of `opts` selects them, to
  entities the export does not take, each `{:node [model id] :via [model id]}`."
  [by-model opts]
  (let [content (set serdes.models/content)]
    (for [[node vias] (serialization/export-escapes
                       (into {}
                             (comp (filter (comp content key))
                                   (map (fn [[model ids]]
                                          [model (eduction (partition-all serialization/batch-size)
                                                           (mapcat #(select/select-rows model (assoc opts :ids (vec %))))
                                                           ids)])))
                             by-model))
          via vias]
      {:node node :via via})))

(defn- existing-ids
  "The subset of `ids` that exist as rows of `model`, queried in bounded `:in` batches."
  [model ids]
  (into #{}
        (comp (distinct)
              (partition-all serialization/batch-size)
              (mapcat #(serialization.db/existing-ids model (vec %))))
        ids))

(def ^:private optional-content-models
  "Content models whose absence from the archive is tolerated on import, so a reference to one is never a completeness
   failure. Omitted Collections resolve to the target root; [[serdes.models/elidable-content-models]] are dropped."
  (conj serdes.models/elidable-content-models :model/Collection))

(defn- unsatisfied-dependencies
  "The escaping `deps` that won't be satisfied in the archive, each tagged with a `:reason`, leaving out content
  references to deleted entities, to [[optional-content-models]], and to the analytics Cards that `analytics-card-ids`,
  a fn of Card ids, picks."
  [deps analytics-card-ids]
  (let [content                             (set serdes.models/content)
        {content-deps true data-deps false} (group-by #(contains? content (first (:node %))) deps)
        content-deps                        (remove (comp optional-content-models first :node) content-deps)
        existing                            #(m/map-kv-vals existing-ids (u/group-by (comp first :node) (comp second :node) %))
        existing-data                       (existing data-deps)
        existing-content                    (existing content-deps)
        analytics-cards                     (analytics-card-ids (vec (distinct (for [{[model id] :node} content-deps
                                                                                     :when (= model :model/Card)]
                                                                                 id))))]
    (concat
     (for [{[model id] :node :as dep} content-deps
           :when (and (contains? (get existing-content model) id)
                      (not (and (= model :model/Card) (contains? analytics-cards id))))]
       (assoc dep :reason :not-in-export))
     (for [{[model id] :node :as dep} data-deps
           :when (not (contains? (get existing-data model) id))]
       (assoc dep :reason :missing-in-appdb)))))

(defn- unsatisfied-label [{[model id] :node :keys [via reason]}]
  (format "%s references %s %s which %s"
          (entity-label via)
          (name model) id
          (case reason
            :not-in-export    "is not included in the export"
            :missing-in-appdb "is missing from the source database")))

(defn validate-dependencies!
  "Validates that every entity an export of `opts` takes has all of its references satisfied (see the namespace
  docstring). Logs a warning per unsatisfied reference and, unless `:continue-on-error`, throws to abort the export
  before any archive is produced. `by-model` is a map of model to ids, and `analytics-card-ids` a fn picking the
  analytics Cards of Card ids."
  [by-model analytics-card-ids opts]
  (let [missing (unsatisfied-dependencies (escaping-dependencies by-model opts) analytics-card-ids)]
    (when (seq missing)
      (doseq [dep missing]
        (log/warnf "Failed to export: %s" (unsatisfied-label dep)))
      (when-not (:continue-on-error opts)
        (throw (ex-info (format (str "Serialization failed: %d reference(s) could not be satisfied, which would "
                                     "produce an incomplete export. See the warnings above for the affected "
                                     "entities. Pass continue-on-error to export anyway, skipping them.")
                                (count missing))
                        {:status-code 400}))))))
