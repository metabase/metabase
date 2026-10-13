(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`, marking written content for the background jobs to recompute."
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
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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

(defn- mark-created!
  "Have the jobs pick up a created entity, which has no id before the insert and no status or findings yet."
  []
  (trigger-jobs!))

(defn- mark-changed!
  "Mark the entity `entity-type` `entity-id` for recalculation, and its dependents for re-analysis when it is analyzed."
  [entity-type entity-id]
  (when entity-id
    (deps.dependency-status/mark-stale! entity-type [entity-id])
    (when (contains? deps.findings/analyzable-entities entity-type)
      (deps.findings/mark-entity-and-transitive-dependents-stale! entity-type entity-id))
    (trigger-jobs!)))

(defn- mark-deleted!
  "Mark the dependents of the deleted entity `entity-type` `entity-id` for re-analysis and drop its dependencies."
  [entity-type entity-id]
  (when (contains? deps.findings/analyzable-entities entity-type)
    (deps.findings/mark-transitive-dependents-stale! {entity-type [entity-id]}))
  (dependencies.db/delete-dependencies-from! entity-type entity-id)
  (dependencies.db/delete-dependency-status! entity-type entity-id)
  (trigger-jobs!))

(defn- changed?
  "Whether the Toucan update of `instance` changes any of `columns`."
  [instance columns]
  (let [changes (t2/changes instance)]
    (some #(contains? changes %) columns)))

(defn- mark-entity-changed!
  "Mark the `model` entity `instance` for recalculation when its update changes any of `columns`."
  [model instance columns]
  (when (changed? instance columns)
    (mark-changed! (deps.dependency-types/model->dependency-type model) (:id instance))))

(def ^:private entity-hierarchy
  "Derives each model whose rows are tracked entities from `::entity`."
  (reduce #(derive %1 %2 ::entity)
          (make-hierarchy)
          [:model/Card :model/Dashboard :model/Document :model/Measure :model/NativeQuerySnippet :model/Sandbox
           :model/Segment :model/Transform]))

(defmulti ^:private inserted!
  "Mark what inserting the `model` row `instance` affects."
  {:arglists '([model instance])}
  (fn [model _instance] model)
  :hierarchy #'entity-hierarchy)

(defmulti ^:private updated!
  "Mark what updating the `model` row `instance` affects."
  {:arglists '([model instance])}
  (fn [model _instance] model)
  :hierarchy #'entity-hierarchy)

(defmulti ^:private deleted!
  "Mark what deleting the `model` row `instance` affects."
  {:arglists '([model instance])}
  (fn [model _instance] model)
  :hierarchy #'entity-hierarchy)

(defmethod inserted! :default [_model _instance] nil)
(defmethod updated! :default [_model _instance] nil)
(defmethod deleted! :default [_model _instance] nil)

(defmethod inserted! ::entity
  [_model _instance]
  (mark-created!))

(defmethod deleted! ::entity
  [model instance]
  (mark-deleted! (deps.dependency-types/model->dependency-type model) (:id instance)))

(defmethod updated! :model/Card
  [model card]
  (mark-entity-changed! model card #{:dataset_query :dimension_mappings :parameters}))

(defmethod updated! :model/Dashboard
  [model dashboard]
  (mark-entity-changed! model dashboard #{:parameters}))

(defmethod updated! :model/Document
  [model document]
  (mark-entity-changed! model document #{:content_type :document}))

(defmethod updated! :model/Measure
  [model measure]
  (mark-entity-changed! model measure #{:definition :table_id}))

(defmethod updated! :model/NativeQuerySnippet
  [model snippet]
  (mark-entity-changed! model snippet #{:content :template_tags}))

(defmethod updated! :model/Sandbox
  [model sandbox]
  (mark-entity-changed! model sandbox #{:card_id}))

(defmethod updated! :model/Segment
  [model segment]
  (mark-entity-changed! model segment #{:definition :table_id}))

(defmethod updated! :model/Transform
  [model transform]
  (mark-entity-changed! model transform #{:source :target}))

(defmethod inserted! :model/DashboardCard
  [_model dashcard]
  (mark-changed! :dashboard (:dashboard_id dashcard)))

(defmethod updated! :model/DashboardCard
  [_model dashcard]
  (when (changed? dashcard #{:card_id :dashboard_id :visualization_settings})
    (doseq [dashboard-id (distinct [(:dashboard_id (t2/original dashcard)) (:dashboard_id dashcard)])]
      (mark-changed! :dashboard dashboard-id))))

(defmethod deleted! :model/DashboardCard
  [_model dashcard]
  (mark-changed! :dashboard (:dashboard_id dashcard)))

(defmethod inserted! :model/DashboardCardSeries
  [_model series]
  (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id (:dashboardcard_id series))))

(defmethod updated! :model/DashboardCardSeries
  [_model series]
  (when (changed? series #{:card_id :dashboardcard_id})
    (doseq [dashcard-id (distinct [(:dashboardcard_id (t2/original series)) (:dashboardcard_id series)])]
      (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id dashcard-id)))))

(defenterprise entity-inserted!
  "Mark what inserting the `model` row `instance` affects for recalculation."
  :feature :dependencies
  [model instance]
  (inserted! model instance))

(defenterprise entity-updated!
  "Mark what updating the `model` row `instance` affects for recalculation."
  :feature :dependencies
  [model instance]
  (updated! model instance))

(defenterprise entity-deleted!
  "Mark what deleting the `model` row `instance` affects for recalculation."
  :feature :dependencies
  [model instance]
  (deleted! model instance))
