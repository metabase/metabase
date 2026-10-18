(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.hooks`, marking written content for the background jobs to recompute."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.core :as grouper]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-triggers
  "The function that triggers each job: `:dependencies` recomputes the dependencies of stale entities,
  `:analysis-findings` re-analyzes them, and `:result-metadata` re-derives the result metadata of the MBQL cards
  depending on them."
  {:dependencies      #'task.dependency/trigger-dependency-job!
   :analysis-findings #'task.analysis-finding/trigger-analysis-finding-job!
   :result-metadata   #'task.result-metadata/trigger-result-metadata-job!})

(def ^:private all-jobs
  "Every job a write can trigger."
  (set (keys job-triggers)))

(defn- trigger-jobs-now!
  "Trigger the `jobs`, logging rather than throwing a failure."
  [jobs]
  (doseq [job jobs]
    (try
      ((job-triggers job))
      (catch Throwable e
        (log/warnf "Failed to trigger the %s job: %s" (name job) (ex-message e))))))

(defn- process-writes!
  "Mark the dependents of the Tables changed by `writes` for re-analysis, then trigger the jobs the `writes` need."
  [writes]
  (when-let [table-ids (not-empty (into #{} (keep :table-id) writes))]
    (deps.findings/mark-transitive-dependents-stale! {:table table-ids}))
  (trigger-jobs-now! (into #{} (mapcat :jobs) writes)))

(def ^:private writes-queue
  (delay (grouper/start! process-writes! :capacity 500 :interval 1000)))

(defn- submit-after-commit!
  "Submit `write` to the batch processed once the current transaction commits."
  [write]
  (mdb/do-after-commit #(grouper/submit! @writes-queue write)))

(defn- trigger-jobs!
  "Have the `jobs` triggered for this write, once it commits, together with the others in its batch, unless a serdes
  load triggers them once it finishes."
  [jobs]
  (when (and (seq jobs) (not mi/*deserializing?*))
    (submit-after-commit! {:jobs jobs})))

(defn- mark-changed!
  "Mark the entity `entity-type` `entity-id` stale for the `jobs` and trigger them."
  [entity-type entity-id jobs]
  (when (and entity-id (seq jobs))
    (when (contains? jobs :dependencies)
      (deps.dependency-status/mark-stale! {entity-type #{entity-id}}))
    (when (contains? jobs :analysis-findings)
      (deps.analysis-finding/mark-stale! {entity-type #{entity-id}}))
    (when (contains? jobs :result-metadata)
      (deps.result-metadata-status/mark-stale! {entity-type #{entity-id}}))
    (trigger-jobs! jobs)))

(defn- changed?
  "Whether the Toucan update of `instance` changes any of `columns`."
  [instance columns]
  (let [changes (t2/changes instance)]
    (some #(contains? changes %) columns)))

(defn- card-result-columns-changed?
  "Whether the update of the Card `card` changes the result columns of the cards depending on it: the query or type of
  an MBQL card, or the non-empty result metadata of a native card, which only a run or a save with it knows."
  [card]
  (if (some-> (:dataset_query card) not-empty lib/native-only-query?)
    (and (changed? card #{:result_metadata}) (seq (:result_metadata card)))
    (changed? card #{:type :dataset_query})))

(def ^:private model-job-columns
  "For each model, the columns whose update makes each job recompute its entity, or a predicate of the updated
  instance, by job, see [[job-triggers]]."
  {:model/Action             {:dependencies      #{:model_id :type}}
   :model/Card               {:dependencies      #{:type :dataset_query :dimension_mappings :parameters}
                              :analysis-findings #{:dataset_query}
                              :result-metadata   card-result-columns-changed?}
   :model/Dashboard          {:dependencies      #{:parameters}}
   :model/Document           {:dependencies      #{:content_type :document}}
   :model/Measure            {:dependencies      #{:definition :table_id}
                              :result-metadata   #{:definition :table_id}}
   :model/NativeQuerySnippet {:dependencies      #{:content :template_tags}}
   :model/Sandbox            {:dependencies      #{:card_id}}
   :model/Segment            {:dependencies      #{:definition :table_id}
                              :analysis-findings #{:definition :table_id}}
   :model/Transform          {:dependencies      #{:source :target}
                              :analysis-findings #{:source :target}}})

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

(doseq [[model job-columns] model-job-columns
        :let [entity-type   (deps.dependency-types/model->dependency-type model)
              entity-jobs   (disj (set (keys job-columns)) :result-metadata)]]
  (defmethod before-insert* model
    [_model _instance]
    (trigger-jobs! entity-jobs))
  (defmethod before-update* model
    [_model instance]
    (mark-changed! entity-type (:id instance) (into #{}
                                                    (keep (fn [[job columns]]
                                                            (when (if (fn? columns)
                                                                    (columns instance)
                                                                    (changed? instance columns))
                                                              job)))
                                                    job-columns)))
  (defmethod before-delete* model
    [_model instance]
    (mark-changed! entity-type (:id instance) entity-jobs)))

(defmethod before-insert* :model/QueryAction
  [_model query-action]
  (mark-changed! :action (:action_id query-action) #{:dependencies}))

(defmethod before-update* :model/QueryAction
  [_model query-action]
  (when (changed? query-action #{:dataset_query})
    (mark-changed! :action (:action_id query-action) #{:dependencies})))

(defmethod before-insert* :model/DashboardCard
  [_model dashcard]
  (mark-changed! :dashboard (:dashboard_id dashcard) #{:dependencies}))

(defmethod before-update* :model/DashboardCard
  [_model dashcard]
  (when (changed? dashcard #{:card_id :dashboard_id :visualization_settings})
    (doseq [dashboard-id (distinct [(:dashboard_id (t2/original dashcard)) (:dashboard_id dashcard)])]
      (mark-changed! :dashboard dashboard-id #{:dependencies}))))

(defmethod before-delete* :model/DashboardCard
  [_model dashcard]
  (mark-changed! :dashboard (:dashboard_id dashcard) #{:dependencies}))

(defmethod before-insert* :model/DashboardCardSeries
  [_model series]
  (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id (:dashboardcard_id series)) #{:dependencies}))

(defmethod before-update* :model/DashboardCardSeries
  [_model series]
  (when (changed? series #{:card_id :dashboardcard_id})
    (doseq [dashcard-id (distinct [(:dashboardcard_id (t2/original series)) (:dashboardcard_id series)])]
      (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id dashcard-id) #{:dependencies}))))

(defmethod before-delete* :model/DashboardCardSeries
  [_model series]
  (mark-changed! :dashboard (dependencies.db/dashcard-dashboard-id (:dashboardcard_id series)) #{:dependencies}))

(defmethod before-delete* :model/DashboardTab
  [_model tab]
  (mark-changed! :dashboard (:dashboard_id tab) #{:dependencies}))

(defn- mark-table-changed!
  "Mark the Table with `table-id` stale for re-deriving the result metadata of the cards depending on it, and its
  dependents for re-analysis once the current transaction commits."
  [table-id]
  (when table-id
    (deps.result-metadata-status/mark-stale! {:table #{table-id}})
    (submit-after-commit! {:table-id table-id :jobs #{:analysis-findings :result-metadata}})))

(defn- mark-unresolved-table-entities!
  "Mark the entities reading from the Database with `database-id` that name tables matching nothing, which a new or
  renamed Table may match now."
  [database-id]
  (when database-id
    (doseq [[entity-type entity-ids] (dependencies.db/unresolved-table-entity-ids database-id)
            entity-id                entity-ids]
      (mark-changed! entity-type entity-id (cond-> #{:dependencies}
                                             (contains? deps.findings/analyzable-entities entity-type)
                                             (conj :analysis-findings))))))

(def ^:private table-columns
  "The Table columns whose update changes the result columns of the cards using the Table."
  #{:name :display_name :description :active :visibility_type})

(def ^:private field-columns
  "The Field columns whose update changes the result columns of the cards using the Field's Table."
  #{:name :display_name :description :active :visibility_type :settings :base_type :effective_type :database_type
    :semantic_type :coercion_strategy :fk_target_field_id})

(defmethod before-insert* :model/Table
  [_model table]
  (mark-unresolved-table-entities! (:db_id table)))

(defmethod before-update* :model/Table
  [_model table]
  (when (changed? table table-columns)
    (mark-table-changed! (:id table)))
  (when (changed? table #{:name :schema :active})
    (mark-unresolved-table-entities! (:db_id table))))

(defmethod before-insert* :model/Field
  [_model field]
  (mark-table-changed! (:table_id field)))

(defmethod before-update* :model/Field
  [_model field]
  (when (changed? field field-columns)
    (mark-table-changed! (:table_id field))))

(defmethod before-delete* :model/Field
  [_model field]
  (mark-table-changed! (:table_id field)))

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
    (mark-changed! :transform transform-id #{:dependencies :analysis-findings})))

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

(defenterprise after-transform-run
  "Make the output Table with `table-id` depend on the transform with `transform-id`, and mark the transform's
  dependents for re-analysis."
  :feature :dependencies
  [transform-id table-id]
  (when table-id
    (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))
  (when (deps.findings/mark-transitive-dependents-stale! {:transform #{transform-id}})
    (trigger-jobs! #{:analysis-findings})))

(defenterprise after-serdes-load
  "Trigger every job for what a serdes load marked."
  :feature :dependencies
  []
  (trigger-jobs-now! all-jobs))

(defenterprise after-premium-token-update
  "Restart every job, since they stop while the dependencies feature is disabled."
  :feature :dependencies
  []
  (trigger-jobs-now! all-jobs))
