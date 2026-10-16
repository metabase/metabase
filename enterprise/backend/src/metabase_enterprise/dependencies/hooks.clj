(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`, marking written content for the background jobs to recompute."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.backfill :as task.backfill]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.models.interface :as mi]
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
    (catch Throwable e
      (log/warnf "Failed to trigger the dependency jobs: %s" (ex-message e)))))

(defn- process-writes!
  "Mark the dependents of the Tables changed by `writes` for re-analysis, then trigger the jobs."
  [writes]
  (when-let [table-ids (not-empty (into #{} (keep :table-id) writes))]
    (deps.findings/mark-transitive-dependents-stale! {:table table-ids}))
  (trigger-jobs-now!))

(def ^:private writes-queue
  (delay (grouper/start! process-writes! :capacity 500 :interval 1000)))

(defn- submit-after-commit!
  "Submit `write` to the batch processed once the current transaction commits."
  [write]
  (mdb/do-after-commit #(grouper/submit! @writes-queue write)))

(defn- trigger-jobs!
  "Have the backfill and entity-check jobs triggered for this write, once it commits, together with the others in its
  batch, unless a serdes load triggers them once it finishes."
  []
  (when-not mi/*deserializing?*
    (submit-after-commit! :ok)))

(defn- mark-changed!
  "Mark the entity `entity-type` `entity-id` for recalculation and, when analyzable, for re-analysis; the backfill job
  marks its dependents for re-analysis."
  [entity-type entity-id]
  (when entity-id
    (deps.dependency-status/mark-stale! {entity-type #{entity-id}})
    (when (contains? deps.findings/analyzable-entities entity-type)
      (deps.analysis-finding/mark-stale! {entity-type #{entity-id}}))
    (trigger-jobs!)))

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

(doseq [model [:model/Action :model/Card :model/Dashboard :model/Document :model/Measure :model/NativeQuerySnippet
               :model/Sandbox :model/Segment :model/Transform]]
  (defmethod before-insert* model
    [_model _instance]
    (trigger-jobs!))
  (defmethod before-delete* model
    [model instance]
    (mark-changed! (deps.dependency-types/model->dependency-type model) (:id instance))))

(doseq [[model columns] {:model/Action             #{:model_id :type}
                         :model/Card               #{:type :dataset_query :dimension_mappings :parameters}
                         :model/Dashboard          #{:parameters}
                         :model/Document           #{:content_type :document}
                         :model/Measure            #{:definition :table_id}
                         :model/NativeQuerySnippet #{:content :template_tags}
                         :model/Sandbox            #{:card_id}
                         :model/Segment            #{:definition :table_id}
                         :model/Transform          #{:source :target}}]
  (defmethod before-update* model
    [model instance]
    (mark-entity-changed! model instance columns)))

(defmethod before-insert* :model/QueryAction
  [_model query-action]
  (mark-changed! :action (:action_id query-action)))

(defmethod before-update* :model/QueryAction
  [_model query-action]
  (when (changed? query-action #{:dataset_query})
    (mark-changed! :action (:action_id query-action))))

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

(defmethod before-delete* :model/DashboardCardSeries
  [_model series]
  (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id (:dashboardcard_id series))))

(defmethod before-delete* :model/DashboardTab
  [_model tab]
  (mark-changed! :dashboard (:dashboard_id tab)))

(defn- mark-table-changed!
  "Mark the dependents of the Table with `table-id` for re-analysis once the current transaction commits."
  [table-id]
  (when table-id
    (submit-after-commit! {:table-id table-id})))

(defmethod before-insert* :model/TableUserSettings
  [_model settings]
  (mark-table-changed! (:table_id settings)))

(defmethod before-update* :model/TableUserSettings
  [_model settings]
  (mark-table-changed! (:table_id settings)))

(defmethod before-delete* :model/TableUserSettings
  [_model settings]
  (mark-table-changed! (:table_id settings)))

(defmethod before-insert* :model/FieldUserSettings
  [_model settings]
  (mark-table-changed! (dependencies.db/field-table-id (:field_id settings))))

(defmethod before-update* :model/FieldUserSettings
  [_model settings]
  (mark-table-changed! (dependencies.db/field-table-id (:field_id settings))))

(defmethod before-delete* :model/FieldUserSettings
  [_model settings]
  (mark-table-changed! (dependencies.db/field-table-id (:field_id settings))))

(defmethod before-insert* :model/Dimension
  [_model dimension]
  (mark-table-changed! (dependencies.db/field-table-id (:field_id dimension))))

(defmethod before-update* :model/Dimension
  [_model dimension]
  (mark-table-changed! (dependencies.db/field-table-id (:field_id dimension))))

(defmethod before-delete* :model/Dimension
  [_model dimension]
  (mark-table-changed! (dependencies.db/field-table-id (:field_id dimension))))

(defmethod before-delete* :model/Database
  [_model database]
  (doseq [transform-id (dependencies.db/transform-ids-of-source-database (:id database))]
    (mark-changed! :transform transform-id)))

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
  "Mark the dependents of the Tables of the Database with `database-id` that changed since they were analyzed, and the
  entities reading from it that name tables that matched nothing, which sync may have found now."
  :feature :dependencies
  [database-id]
  (doseq [[entity-type entity-ids] (dependencies.db/unresolved-table-entity-ids database-id)
          entity-id                entity-ids]
    (mark-changed! entity-type entity-id))
  (when (deps.findings/mark-transitive-dependents-stale!
         {:table (dependencies.db/table-ids-with-outdated-findings database-id)})
    (trigger-jobs!)))

(defenterprise after-transform-run
  "Make the output Table with `table-id` depend on the transform with `transform-id`, and mark the transform's
  dependents for re-analysis."
  :feature :dependencies
  [transform-id table-id]
  (when table-id
    (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
  (when (deps.findings/mark-transitive-dependents-stale! {:transform #{transform-id}})
    (trigger-jobs!)))

(defenterprise after-serdes-load
  "Trigger the backfill and entity-check jobs for what a serdes load marked."
  :feature :dependencies
  []
  (trigger-jobs-now!))

(defenterprise after-premium-token-update
  "Restart the backfill and entity-check jobs, which stop while the dependencies feature is disabled."
  :feature :dependencies
  []
  (trigger-jobs-now!))
