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

(def ^:private dependency-columns
  "The columns of each model that its own dependencies, or those of the entity it is part of, are calculated from."
  {:model/Card                #{:dataset_query :dimension_mappings :parameters}
   :model/Dashboard           #{:parameters}
   :model/DashboardCard       #{:card_id :dashboard_id :visualization_settings}
   :model/DashboardCardSeries #{:card_id :dashboardcard_id}
   :model/Document            #{:content_type :document}
   :model/Measure             #{:definition :table_id}
   :model/NativeQuerySnippet  #{:content :template_tags}
   :model/Sandbox             #{:card_id}
   :model/Segment             #{:definition :table_id}
   :model/Transform           #{:source}})

(defn- dependency-owner
  "The `[entity-type id]` whose dependencies the `model` row `instance` is part of, or nil."
  [model instance]
  (case model
    :model/DashboardCard       [:dashboard (:dashboard_id instance)]
    :model/DashboardCardSeries [:dashboard (some-> (:dashboardcard_id instance) dependencies.db/dashcard-dashboard-id)]
    (some-> (deps.dependency-types/model->dependency-type model) (vector (:id instance)))))

(defn- own-row?
  "Whether the `model` row is a tracked entity itself rather than part of one."
  [model]
  (some? (deps.dependency-types/model->dependency-type model)))

(defn- owner-changed!
  "Mark the entity `entity-type` `entity-id` for recalculation, and its dependents for re-analysis when it is analyzed."
  [[entity-type entity-id]]
  (when entity-id
    (deps.dependency-status/mark-stale! entity-type [entity-id])
    (when (contains? deps.findings/analyzable-entities entity-type)
      (deps.findings/mark-entity-and-transitive-dependents-stale! entity-type entity-id))
    (trigger-jobs!)))

(defn- owner-deleted!
  "Mark the dependents of the deleted entity `entity-type` `entity-id` for re-analysis and drop its dependencies."
  [[entity-type entity-id]]
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
  (logging-failures model #(if (own-row? model)
                             (trigger-jobs!)
                             (owner-changed! (dependency-owner model instance)))))

(defenterprise entity-updated!
  "Mark the entity an updated `model` row is, or was and is now part of, for recalculation when a column its
  dependencies come from changes."
  :feature :dependencies
  [model instance]
  (let [changes (t2/changes instance)]
    (when (some #(contains? changes %) (dependency-columns model))
      (logging-failures model #(doseq [owner (distinct [(dependency-owner model (t2/original instance))
                                                        (dependency-owner model instance)])]
                                 (owner-changed! owner))))))

(defenterprise entity-deleted!
  "Drop the dependencies of a deleted entity, or mark the entity a `model` row is deleted from for recalculation."
  :feature :dependencies
  [model instance]
  (logging-failures model #(if (own-row? model)
                             (owner-deleted! (dependency-owner model instance))
                             (owner-changed! (dependency-owner model instance)))))
