(ns metabase.dependencies.core
  "Public API of the OSS slice of the dependency graph.

  The dependency graph proper — traversal APIs, breakage analysis, diagnostics — is an
  enterprise feature (see `metabase-enterprise.dependencies.*`). OSS tracks dependencies for
  transforms only, so that transform-job planning and cycle detection can read precomputed
  table dependencies instead of re-parsing every transform's source (natively via the SQL
  parser, which is far too slow to run per-transform on every read at any real scale)."
  (:require
   [metabase.dependencies.models.dependency :as models.dependency]
   [metabase.dependencies.task.backfill :as task.backfill]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [models.dependency
  replace-dependencies!]
 [task.backfill
  trigger-backfill-job!])

(defn transform-stored-deps
  "Map of transform-id -> #{{:table id} | {:transform id}} for the subset of `transform-ids`
  whose stored dependency rows can be used for execution ordering: their dependency_status is
  fresh (present, not stale, current analysis version) and they don't read through a card or
  snippet. Deps of transforms that read through a card/snippet can change without the
  transform itself changing, so we make no claim about them (they are absent from the returned
  map); callers must fall back to computing those live. Edges that can't affect table-level
  ordering (measures, segments, ...) are dropped.

  Ids with no dependency_status row at all (e.g. rows inserted without events, or created
  before this feature) additionally trigger the backfill job, which converges them off-thread;
  see [[metabase.dependencies.task.backfill]]."
  [transform-ids]
  (if (empty? transform-ids)
    {}
    (let [status-rows (t2/select [:model/DependencyStatus :entity_id :stale :dependency_analysis_version]
                                 :entity_type :transform
                                 :entity_id [:in transform-ids])
          fresh-ids   (into #{}
                            (comp (filter #(and (false? (:stale %))
                                                (= (:dependency_analysis_version %)
                                                   models.dependency/current-dependency-analysis-version)))
                                  (map :entity_id))
                            status-rows)
          deps-rows   (when (seq fresh-ids)
                        (t2/select [:model/Dependency :from_entity_id :to_entity_type :to_entity_id]
                                   :from_entity_type :transform
                                   :from_entity_id [:in fresh-ids]))
          rows-by-id  (group-by :from_entity_id deps-rows)]
      (when (< (count status-rows) (count (set transform-ids)))
        (trigger-backfill-job!))
      (into {}
            (keep (fn [id]
                    (when (contains? fresh-ids id)
                      (let [rows (rows-by-id id)]
                        (when-not (some #(#{:card :snippet} (:to_entity_type %)) rows)
                          [id (into #{}
                                    (comp (filter #(#{:table :transform} (:to_entity_type %)))
                                          (map (fn [{:keys [to_entity_type to_entity_id]}]
                                                 {to_entity_type to_entity_id})))
                                    rows)])))))
            (distinct transform-ids)))))

(defn hydrate-stored-deps
  "Attach `:stored-deps` to each of `transforms` (maps with an `:id`) whose stored dependency
  rows are usable for ordering — see [[transform-stored-deps]]. Transforms without usable
  stored deps are returned unchanged; the ordering code computes their dependencies live (see
  `metabase.transforms-base.ordering/stored-or-live-deps`)."
  [transforms]
  (let [deps-map (transform-stored-deps (keep :id transforms))]
    (map (fn [{:keys [id] :as transform}]
           (if-some [deps (get deps-map id)]
             (assoc transform :stored-deps deps)
             transform))
         transforms)))
