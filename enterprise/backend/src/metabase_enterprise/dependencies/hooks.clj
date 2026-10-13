(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.core`, marking written content for the background jobs to recompute."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.backfill :as task.backfill]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private trigger-delay-ms
  "How long writes are collected before the jobs are triggered for all of them."
  1000)

(defonce ^:private trigger-pending? (atom false))

(defn- trigger-jobs!
  "Trigger the backfill and entity-check jobs once for every write made within the next second."
  []
  (when (compare-and-set! trigger-pending? false true)
    (future
      (try
        (Thread/sleep (long trigger-delay-ms))
        (reset! trigger-pending? false)
        (task.backfill/trigger-backfill-job!)
        (task.entity-check/trigger-entity-check-job!)
        (catch Exception e
          (reset! trigger-pending? false)
          (log/warnf "Failed to trigger the dependency jobs: %s" (ex-message e)))))))

(def ^:private tracked-models
  "For each model, the `:columns` that dependencies are calculated from, and for models whose rows are parts of an
  entity, the `:owner-type` of that entity and the `:owner-id` function finding it from a row."
  {:model/Card                {:columns #{:dataset_query :dimension_mappings :parameters}}
   :model/Dashboard           {:columns #{:parameters}}
   :model/DashboardCard       {:columns    #{:card_id :dashboard_id :visualization_settings}
                               :owner-type :dashboard
                               :owner-id   :dashboard_id}
   :model/DashboardCardSeries {:columns    #{:card_id :dashboardcard_id}
                               :owner-type :dashboard
                               :owner-id   #(some-> (:dashboardcard_id %) dependencies.db/dashcard-dashboard-id)}
   :model/Document            {:columns #{:content_type :document}}
   :model/Measure             {:columns #{:definition :table_id}}
   :model/NativeQuerySnippet  {:columns #{:content :template_tags}}
   :model/Sandbox             {:columns #{:card_id}}
   :model/Segment             {:columns #{:definition :table_id}}
   :model/Transform           {:columns #{:source :target}}})

(defn- entity-model?
  "Whether rows of `model` are tracked entities themselves rather than parts of one."
  [model]
  (not (get-in tracked-models [model :owner-type])))

(defn- owner-type
  "The dependency type of the entity that rows of `model` are, or are part of."
  [model]
  (or (get-in tracked-models [model :owner-type])
      (deps.dependency-types/model->dependency-type model)))

(defn- owner-id
  "The id of the entity that the `model` row `instance` is, or is part of, or nil."
  [model instance]
  ((get-in tracked-models [model :owner-id] :id) instance))

(defn- owner-changed!
  "Mark the entity `entity-type` `entity-id` for recalculation, and its dependents for re-analysis when it is analyzed."
  [entity-type entity-id]
  (when entity-id
    (deps.dependency-status/mark-stale! entity-type [entity-id])
    (when (contains? deps.findings/analyzable-entities entity-type)
      (deps.findings/mark-entity-and-transitive-dependents-stale! entity-type entity-id))
    (trigger-jobs!)))

(defn- owner-deleted!
  "Mark the dependents of the deleted entity `entity-type` `entity-id` for re-analysis and drop its dependencies."
  [entity-type entity-id]
  (when (contains? deps.findings/analyzable-entities entity-type)
    (deps.findings/mark-transitive-dependents-stale! {entity-type [entity-id]}))
  (dependencies.db/delete-dependencies-from! entity-type entity-id)
  (dependencies.db/delete-dependency-status! entity-type entity-id)
  (trigger-jobs!))

(defn- logging-failures
  "Run `f`, logging a failure rather than failing the write of the `model` row that called it."
  [model f]
  (try
    (f)
    (catch Exception e
      (log/warnf "Failed to update the dependencies of a %s: %s" (name model) (ex-message e)))))

(defenterprise entity-inserted!
  "Have the jobs pick up an inserted entity, which has no status or findings yet, or mark the entity a `model` row is
  being inserted into for recalculation."
  :feature :dependencies
  [model instance]
  (logging-failures model #(if (entity-model? model)
                             (trigger-jobs!)
                             (owner-changed! (owner-type model) (owner-id model instance)))))

(defenterprise entity-updated!
  "Mark the entity an updated `model` row is, or was and is now part of, for recalculation when a column its
  dependencies come from changes."
  :feature :dependencies
  [model instance]
  (let [changes (t2/changes instance)]
    (when (some #(contains? changes %) (get-in tracked-models [model :columns]))
      (logging-failures model #(doseq [id (distinct [(owner-id model (t2/original instance))
                                                     (owner-id model instance)])]
                                 (owner-changed! (owner-type model) id))))))

(defenterprise entity-deleted!
  "Drop the dependencies of a deleted entity, or mark the entity a `model` row is deleted from for recalculation."
  :feature :dependencies
  [model instance]
  (logging-failures model #(if (entity-model? model)
                             (owner-deleted! (owner-type model) (owner-id model instance))
                             (owner-changed! (owner-type model) (owner-id model instance)))))
