(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`, triggering the background jobs once a write commits. The jobs
  find what changed from the `version` of each entity, so an insert or an update records nothing for them."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
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
  "Have every job triggered once the current transaction commits, together with the other writes in its batch."
  []
  (mdb/do-after-commit #(grouper/submit! @writes-queue {:dependency-jobs true})))

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

(defn- part-owner
  "The entity, as `[entity-type entity-id]`, that the `model` row `instance` is a part of, or nil."
  [model instance]
  (case model
    (:model/DashboardCard :model/DashboardTab)    [:dashboard (:dashboard_id instance)]
    :model/DashboardCardSeries                    [:dashboard (some-> (:dashboardcard_id instance)
                                                                      dependencies.db/dashcard-dashboard-id)]
    :model/QueryAction                            [:action (:action_id instance)]
    (:model/Field :model/TableUserSettings)       [:table (:table_id instance)]
    (:model/FieldUserSettings :model/Dimension)   [:table (some-> (:field_id instance) dependencies.db/field-table-id)]
    nil))

(defenterprise before-delete
  "Trigger the jobs for deleting the `model` row `instance`, having the entity it is a part of, or the transforms of a
  deleted Database, processed again, since a delete lowers the version of the entity it is part of, and the entities
  transitively depending on a deleted entity, since nothing picks it to have them processed."
  :feature :dependencies
  [model instance]
  (let [[owner-type owner-id] (part-owner model instance)
        entity-type           (deps.dependency-types/model->dependency-type model)]
    (when owner-id
      (dependencies.db/forget-entity-processing! owner-type owner-id))
    (when entity-type
      (dependencies.db/forget-dependents-processing!
       (models.dependency/transitive-dependents {entity-type [instance]})))
    (when (= model :model/Database)
      (doseq [transform-id (dependencies.db/source-database-transform-ids (:id instance))]
        (dependencies.db/forget-entity-processing! :transform transform-id))))
  (trigger-jobs!))

(defenterprise after-transform-run
  "Make the output Table with `table-id` depend on the transform with `transform-id`."
  :feature :dependencies
  [transform-id table-id]
  (when table-id
    (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
  (trigger-jobs!))

(defenterprise after-premium-token-update
  "Restart every job, since they stop while the dependencies feature is disabled."
  :feature :dependencies
  []
  (trigger-jobs-now!))
