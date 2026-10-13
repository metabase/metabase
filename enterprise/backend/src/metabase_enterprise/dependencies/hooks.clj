(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.core`, marking written content for the background jobs to recompute."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.backfill :as task.backfill]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- trigger-jobs!*
  "Trigger the backfill and entity-check jobs once for a batch of writes."
  [_writes]
  (try
    (task.backfill/trigger-backfill-job!)
    (task.entity-check/trigger-entity-check-job!)
    (catch Exception e
      (log/warnf "Failed to trigger the dependency jobs: %s" (ex-message e)))))

(def ^:private trigger-jobs-queue
  (delay (grouper/start! #'trigger-jobs!* :capacity 500 :interval 1000)))

(defn- trigger-jobs!
  "Have the backfill and entity-check jobs triggered for this write, once it commits, together with the others in its
  batch."
  []
  (mdb/do-after-commit #(grouper/submit! @trigger-jobs-queue :ok)))

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
  "Have the jobs pick up an inserted entity, or mark the entity a `model` row is being inserted into for recalculation."
  :feature :dependencies
  [_model _instance {:keys [owner-model owner-id]}]
  (if owner-model
    (owner-changed! (deps.dependency-types/model->dependency-type owner-model) owner-id)
    (owner-created!)))

(defenterprise entity-updated!
  "Mark the entity an updated `model` row is, or is part of, for recalculation."
  :feature :dependencies
  [model instance {:keys [owner-model owner-id]}]
  (if owner-model
    (owner-changed! (deps.dependency-types/model->dependency-type owner-model) owner-id)
    (owner-changed! (deps.dependency-types/model->dependency-type model) (:id instance))))

(defenterprise entity-deleted!
  "Drop the dependencies of a deleted entity, or mark the entity a `model` row is deleted from for recalculation."
  :feature :dependencies
  [model instance {:keys [owner-model owner-id]}]
  (if owner-model
    (owner-changed! (deps.dependency-types/model->dependency-type owner-model) owner-id)
    (owner-deleted! (deps.dependency-types/model->dependency-type model) (:id instance))))
