(ns metabase-enterprise.serialization.v2.dependency-validation
  "Export-time dependency validation for serialization.

  Before an export is written, every entity that will be extracted is checked to make sure all of its references are
  satisfiable in the resulting archive: content references (Cards, Dashboards, …) must themselves be part of the
  export, and data-model references (Database, Table, Field) must exist in the source appdb. An unsatisfied reference
  would otherwise become a dangling reference or a malformed portable id in the archive, breaking the import.

  Historically this was the collection-id, Card-only \"escape analysis\"; it is now a general dependency-satisfaction
  check driven by [[metabase.models.serialization/serialization-dependencies]]."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- collection-label [coll-id]
  (if coll-id
    (let [collection (t2/hydrate (t2/select-one :model/Collection :id coll-id) :ancestors)
          names      (->> (conj (:ancestors collection) collection)
                          (map :name)
                          (str/join " > "))]
      (format "%d: %s" coll-id names))
    "[no collection]"))

(defn- entity-label [{:keys [model id]}]
  (let [entity (t2/select-one [model :collection_id :name] :id id)]
    (format "%s %d (%s from collection %s)" (name model) id (:name entity) (collection-label (:collection_id entity)))))

(defn- resize-batch
  [[model batch]]
  (for [batch (partition-all serdes/query-batch-size batch)]
    [model batch]))

(defn- entity-deps
  "The dependency contribution of a single entity.

  Returns a `{:visited :deps}`. `serialization-dependencies` yields `:serdes/meta` paths (each a vector whose last
  element identifies the referenced entity), so we take that last element and tag it with the `:via` entity."
  [entity]
  (let [model (name (t2/model entity))
        via   [model (:id entity)]]
    {:visited #{via}
     :deps    (into #{}
                    (map #(assoc (peek %) :via via))
                    (serdes/serialization-dependencies model entity))}))

(defn- merge-entity-deps
  "Monoid merging [[entity-deps]] contributions: unions the `:visited` and `:deps` sets. Identity is empty sets."
  ([] {:visited #{} :deps #{}})
  ([acc] acc)
  ([acc contribution] (merge-with into acc contribution)))

(defn- collect-dependencies
  "Take the model/ids and return {:visited :deps}. Entities are streamed in batches, not held in memory."
  [by-model coll-set opts]
  (let [content-models (set serdes.models/content)]
    (transduce
     (comp
      (filter (comp content-models key))
      (mapcat resize-batch)
      (mapcat (fn [[model batch]]
                (serdes/extract-query model (merge opts {:collection-set coll-set
                                                         :where          [:in :id batch]}))))
      (map entity-deps))
     merge-entity-deps
     by-model)))

(defn- existing-ids
  "The subset of `ids` that exist as rows of `model` (a model-name string), queried in bounded `:in` batches."
  [model ids]
  (into #{}
        (comp (distinct)
              (partition-all serdes/query-batch-size)
              (mapcat #(t2/select-pks-set (keyword "model" model) {:where [:in :id %]})))
        ids))

(def ^:private structural-content-models
  "Content models whose absence from the archive is tolerated on import, so a reference to one is never a completeness
   failure. A selective export routinely omits the Collection tree an entity lives in; the entity then loads at the
   root of the target rather than producing a dangling reference."
  #{"Collection"})

(defn- unsatisfied-dependencies
  "The `deps` that won't be satisfied in the archive, each tagged with a `:reason` (see the namespace docstring for the
   data-model vs content classification). Two subtleties are encoded below: a content reference to a *deleted* entity
   is not a failure (export can't emit a portable id for a gone row, so `fk-elide` just drops it), and
   [[structural-content-models]] references are ignored entirely."
  [deps visited analytics-cards]
  (let [content-models (set serdes.models/content)
        {content-deps true data-deps false} (group-by #(contains? content-models (:model %)) deps)
        content-deps   (remove (comp structural-content-models :model) content-deps)
        existing-data    (m/map-kv-vals existing-ids (u/group-by :model :id data-deps))
        existing-content (m/map-kv-vals existing-ids (u/group-by :model :id content-deps))]
    (concat
     (for [{:keys [model id] :as dep} content-deps
           :when (and (contains? (get existing-content model) id)
                      (not (contains? visited [model id]))
                      (not (and (= model "Card") (contains? analytics-cards id))))]
       (assoc dep :reason :not-in-export))
     (for [{:keys [model id] :as dep} data-deps
           :when (not (contains? (get existing-data model) id))]
       (assoc dep :reason :missing-in-appdb)))))

(defn- unsatisfied-label [{:keys [model id via reason]}]
  (format "%s references %s %s which %s"
          (entity-label {:model (keyword "model" (first via)) :id (second via)})
          model id
          (case reason
            :not-in-export    "is not included in the export"
            :missing-in-appdb "is missing from the source database")))

(defn validate-dependencies!
  "Validates that every entity to be extracted has all of its references satisfied (see the namespace docstring). Logs
  a warning per unsatisfied reference and, unless `:continue-on-error`, throws to abort the export before any archive
  is produced. `by-model` is a map of `{model-name [ids ...]}`."
  [by-model coll-set analytics-cards opts]
  (let [{:keys [visited deps]} (collect-dependencies by-model coll-set opts)
        missing                (unsatisfied-dependencies deps visited analytics-cards)]
    (when (seq missing)
      (doseq [dep missing]
        (log/warnf "Failed to export: %s" (unsatisfied-label dep)))
      (when-not (:continue-on-error opts)
        (throw (ex-info (format (str "Serialization failed: %d reference(s) could not be satisfied, which would "
                                     "produce an incomplete export. See the warnings above for the affected "
                                     "entities. Pass continue-on-error to export anyway, skipping them.")
                                (count missing))
                        {:status-code 400}))))))
