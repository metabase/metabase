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
   [metabase.util.log :as log]))

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

(defn- owner-type
  "The dependency type of the entity that rows of `model` are, or with `owner-model` are part of."
  [model {:keys [owner-model]}]
  (deps.dependency-types/model->dependency-type (or owner-model model)))

(defn- owner-id
  "The id of the entity that the row `instance` is, or the `owner-id` of the entity it is part of."
  [instance {:keys [owner-model owner-id]}]
  (if owner-model
    owner-id
    (:id instance)))

(defn- owner-created!
  "Have the jobs pick up a created entity, which has no id before the insert and no status or findings yet."
  []
  (trigger-jobs!))

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

(defenterprise entity-inserted!
  "Have the jobs pick up an inserted entity, which has no status or findings yet, or mark the entity a `model` row is
  being inserted into for recalculation."
  :feature :dependencies
  [model instance opts]
  (if (:owner-model opts)
    (owner-changed! (owner-type model opts) (owner-id instance opts))
    (owner-created!)))

(defenterprise entity-updated!
  "Mark the entity an updated `model` row is, or is part of, for recalculation."
  :feature :dependencies
  [model instance opts]
  (owner-changed! (owner-type model opts) (owner-id instance opts)))

(defenterprise entity-deleted!
  "Drop the dependencies of a deleted entity, or mark the entity a `model` row is deleted from for recalculation."
  :feature :dependencies
  [model instance opts]
  (if (:owner-model opts)
    (owner-changed! (owner-type model opts) (owner-id instance opts))
    (owner-deleted! (owner-type model opts) (owner-id instance opts))))
