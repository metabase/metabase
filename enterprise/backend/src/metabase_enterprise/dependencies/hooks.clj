(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`, triggering the background jobs once a write commits. The jobs
  find what changed from the `updated_at` of each entity, so a write records nothing for them."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private job-triggers
  "The functions that trigger the jobs: the dependency job, the analysis finding job, and the result metadata job."
  [#'task.dependency/trigger-dependency-job!
   #'task.analysis-finding/trigger-analysis-finding-job!
   #'task.result-metadata/trigger-result-metadata-job!])

(defn- trigger-jobs-now!
  "Trigger every job, logging rather than throwing a failure."
  []
  (doseq [trigger! job-triggers]
    (try
      (trigger!)
      (catch Throwable e
        (log/warnf "Failed to trigger %s: %s" (name (symbol trigger!)) (ex-message e))))))

(def ^:private writes-queue
  (delay (grouper/start! (fn [_writes] (trigger-jobs-now!)) :capacity 500 :interval 1000)))

(defn- trigger-jobs!
  "Have every job triggered once the current transaction commits, together with the other writes in its batch, unless
  a serdes load triggers them once it finishes."
  []
  (when-not mi/*deserializing?*
    (mdb/do-after-commit #(grouper/submit! @writes-queue {:dependency-jobs true}))))

(defenterprise before-insert
  "Trigger the jobs for inserting the `model` row `instance`."
  :feature :dependencies
  [_model _instance]
  (trigger-jobs!))

(defenterprise before-update
  "Trigger the jobs for updating the `model` row `instance`."
  :feature :dependencies
  [_model _instance]
  (trigger-jobs!))

(defenterprise before-delete
  "Trigger the jobs for deleting the `model` row `instance`, and for a Database, move the `updated_at` of the transforms
  reading from it, since the delete clears their source database without a write through their model."
  :feature :dependencies
  [model instance]
  (when (= model :model/Database)
    (dependencies.db/touch-transforms-of-source-database! (:id instance)))
  (trigger-jobs!))

(defenterprise after-transform-run
  "Make the output Table with `table-id` depend on the transform with `transform-id`, and have the transform's
  dependents re-analyzed, since the table may be one of them now."
  :feature :dependencies
  [transform-id table-id]
  (when table-id
    (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
  (dependencies.db/clear-status-version! :model/AnalysisFindingStatus :transform transform-id)
  (trigger-jobs!))

(defenterprise after-serdes-load
  "Trigger every job for what a serdes load wrote."
  :feature :dependencies
  []
  (trigger-jobs-now!))

(defenterprise after-premium-token-update
  "Restart every job, since they stop while the dependencies feature is disabled."
  :feature :dependencies
  []
  (trigger-jobs-now!))
