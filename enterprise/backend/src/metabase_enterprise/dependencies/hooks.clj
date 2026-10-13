(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`, marking written content for the background jobs to recompute."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.metadata-update :as deps.metadata-update]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.backfill :as task.backfill]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- trigger-jobs-now!
  "Trigger the backfill and entity-check jobs, logging rather than throwing a failure."
  []
  (try
    (task.backfill/trigger-backfill-job!)
    (task.entity-check/trigger-entity-check-job!)
    (catch Exception e
      (log/warnf "Failed to trigger the dependency jobs: %s" (ex-message e)))))

(def ^:private trigger-jobs-queue
  (delay (grouper/start! (fn [_writes] (trigger-jobs-now!)) :capacity 500 :interval 1000)))

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

(defmulti ^:private before-insert*
  "Mark what inserting the `model` row `instance` affects."
  {:arglists '([model instance])}
  (fn [model _instance] model))

(defmulti ^:private before-update*
  "Mark what updating the `model` row `instance` affects."
  {:arglists '([model instance])}
  (fn [model _instance] model))

(defmulti ^:private before-delete*
  "Mark what deleting the `model` row `instance` affects."
  {:arglists '([model instance])}
  (fn [model _instance] model))

(defmethod before-insert* :default [_model _instance] nil)
(defmethod before-update* :default [_model _instance] nil)
(defmethod before-delete* :default [_model _instance] nil)

(doseq [model [:model/Card :model/Dashboard :model/Document :model/Measure :model/NativeQuerySnippet :model/Sandbox
               :model/Segment :model/Transform]]
  (defmethod before-insert* model
    [_model _instance]
    (mark-created!))
  (defmethod before-delete* model
    [model instance]
    (mark-deleted! (deps.dependency-types/model->dependency-type model) (:id instance))))

(defmethod before-update* :model/Card
  [model card]
  (mark-entity-changed! model card #{:dataset_query :dimension_mappings :parameters})
  (when (changed? card #{:dataset_query :result_metadata :type})
    (let [card-id       (:id card)
          previous-card (t2/original card)]
      (mdb/do-after-commit #(deps.metadata-update/card-updated! card-id previous-card)))))

(defmethod before-update* :model/Dashboard
  [model dashboard]
  (mark-entity-changed! model dashboard #{:parameters}))

(defmethod before-update* :model/Document
  [model document]
  (mark-entity-changed! model document #{:content_type :document}))

(defmethod before-update* :model/Measure
  [model measure]
  (mark-entity-changed! model measure #{:definition :table_id}))

(defmethod before-update* :model/NativeQuerySnippet
  [model snippet]
  (mark-entity-changed! model snippet #{:content :template_tags}))

(defmethod before-update* :model/Sandbox
  [model sandbox]
  (mark-entity-changed! model sandbox #{:card_id}))

(defmethod before-update* :model/Segment
  [model segment]
  (mark-entity-changed! model segment #{:definition :table_id}))

(defmethod before-update* :model/Transform
  [model transform]
  (mark-entity-changed! model transform #{:source :target}))

(defmethod before-insert* :model/DashboardCard
  [_model dashcard]
  (mark-changed! :dashboard (:dashboard_id dashcard)))

(defmethod before-update* :model/DashboardCard
  [_model dashcard]
  (when (changed? dashcard #{:card_id :dashboard_id :visualization_settings})
    (doseq [dashboard-id (distinct [(:dashboard_id (t2/original dashcard)) (:dashboard_id dashcard)])]
      (mark-changed! :dashboard dashboard-id))))

(defmethod before-delete* :model/DashboardCard
  [_model dashcard]
  (mark-changed! :dashboard (:dashboard_id dashcard)))

(defmethod before-insert* :model/DashboardCardSeries
  [_model series]
  (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id (:dashboardcard_id series))))

(defmethod before-update* :model/DashboardCardSeries
  [_model series]
  (when (changed? series #{:card_id :dashboardcard_id})
    (doseq [dashcard-id (distinct [(:dashboardcard_id (t2/original series)) (:dashboardcard_id series)])]
      (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id dashcard-id)))))

(defn- mark-tables-changed!
  "Mark the dependents of the Tables with `table-ids` for re-analysis."
  [table-ids]
  (when (deps.findings/mark-transitive-dependents-stale! {:table (filterv some? table-ids)})
    (trigger-jobs!)))

(defmethod before-insert* :model/TableUserSettings
  [_model settings]
  (mark-tables-changed! [(:table_id settings)]))

(defmethod before-update* :model/TableUserSettings
  [_model settings]
  (mark-tables-changed! [(:table_id settings)]))

(defmethod before-insert* :model/FieldUserSettings
  [_model settings]
  (mark-tables-changed! [(dependencies.db/field-table-id (:field_id settings))]))

(defmethod before-update* :model/FieldUserSettings
  [_model settings]
  (mark-tables-changed! [(dependencies.db/field-table-id (:field_id settings))]))

(defmethod before-insert* :model/Dimension
  [_model dimension]
  (mark-tables-changed! [(dependencies.db/field-table-id (:field_id dimension))]))

(defmethod before-update* :model/Dimension
  [_model dimension]
  (mark-tables-changed! [(dependencies.db/field-table-id (:field_id dimension))]))

(defmethod before-delete* :model/Dimension
  [_model dimension]
  (mark-tables-changed! [(dependencies.db/field-table-id (:field_id dimension))]))

(defmethod before-delete* :model/Database
  [_model database]
  (when-let [transform-ids (not-empty (dependencies.db/transform-ids-of-source-database (:id database)))]
    (deps.analysis-finding/mark-stale! :transform transform-ids)
    (deps.findings/mark-transitive-dependents-stale! {:transform transform-ids})
    (trigger-jobs!)))

(defenterprise before-insert
  "Mark what inserting the `model` row `instance` affects for recalculation."
  :feature :dependencies
  [model instance]
  (before-insert* model instance))

(defenterprise before-update
  "Mark what updating the `model` row `instance` affects for recalculation."
  :feature :dependencies
  [model instance]
  (before-update* model instance))

(defenterprise before-delete
  "Mark what deleting the `model` row `instance` affects for recalculation."
  :feature :dependencies
  [model instance]
  (before-delete* model instance))

(defenterprise after-database-sync
  "Mark the dependents of the Tables of the Database with `database-id` that changed since they were analyzed."
  :feature :dependencies
  [database-id]
  (mark-tables-changed! (dependencies.db/table-ids-with-outdated-findings database-id)))

(defenterprise after-transform-run
  "Make the output table `table-name` in `schema` of the Database with `db-id` depend on the transform with
  `transform-id`, and mark the transform's dependents for re-analysis."
  :feature :dependencies
  [transform-id db-id schema table-name]
  (when-let [table-id (dependencies.db/table-id-by-name db-id schema table-name)]
    (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
  (when (deps.findings/mark-transitive-dependents-stale! {:transform [transform-id]})
    (trigger-jobs!)))

(defenterprise after-premium-token-update
  "Restart the backfill and entity-check jobs, which stop while the dependencies feature is disabled."
  :feature :dependencies
  []
  (trigger-jobs-now!))
