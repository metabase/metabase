(ns metabase-enterprise.dependencies.task.dependency
  "Implements a task that brings all entities with dependencies tracked in the dependency table
  (see [[metabase-enterprise.dependencies.models.dependency]]) up to date, that is, makes sure
  the dependency table contains fresh entries.

  It selects the entities whose dependency_status records another version of them (their latest `updated_at` and
  number of parts), an older dependency_analysis_version, or no row, computes their dependencies, and records the
  version it computed them from."
  (:require
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private expanded-into-dependents
  "The entity types whose content a native query using them expands into its own SQL, so that a change to one changes
  the table dependencies of the entities using it, which no graph edge carries."
  #{:snippet})

(def ^:private entity-types
  "The list of entity types whose dependencies the job computes, those expanded into their dependents first, so that
  the dependents they have computed again are computed in the same run.

  This is not the same as deps.dependency-types/dependency-types, because tables have no dependencies of their
  own. Instead, links involving tables are found via analysis of the other side of the relation."
  (vec (sort-by (complement expanded-into-dependents) deps.dependency-types/backfillable-dependency-types)))

;;; ------------------------------ Post-deps cleanup multimethod ------------------------------

(defmulti post-deps-cleanup!
  "Perform entity-specific cleanup after dependencies have been replaced.
  For example, transforms need to clean up outdated downstream table->transform dependencies.
  Default is no-op."
  {:arglists '([entity-type entity])}
  (fn [entity-type _entity] entity-type))

(defmethod post-deps-cleanup! :default [_ _entity] nil)

(defmethod post-deps-cleanup! :transform [_ {:keys [id target] :as transform}]
  (let [db-id                (transforms/transform-source-database transform)
        downstream-table-ids (dependencies.db/downstream-table-ids-of-transform id)
        downstream-tables    (when (seq downstream-table-ids)
                               (dependencies.db/tables downstream-table-ids))
        outdated-tables      (remove (fn [table]
                                       (and (= (:schema table) (:schema target))
                                            (= (:name   table) (:name   target))
                                            (or (not db-id)
                                                (= db-id (:db_id table)))))
                                     downstream-tables)
        not-found-table-ids  (remove (into #{} (map :id) downstream-tables)
                                     downstream-table-ids)]
    (when-let [outdated-downstream-table-ids (seq (into (set not-found-table-ids)
                                                        (map :id) outdated-tables))]
      (dependencies.db/delete-table-dependencies-on-transform! outdated-downstream-table-ids id))))

;;; ------------------------------ Job orchestration ------------------------------

(defn- processable-instances
  "Up to `batch-size` instances of `entity-type` whose dependencies need computing, hydrated, each paired with its
  version."
  [entity-type batch-size]
  (let [pairs (deps.dependency-status/instances-for-dependency-calculation entity-type batch-size)]
    (map vector
         (deps.dependency-status/hydrate-for-deps entity-type (mapv first pairs))
         (map second pairs))))

(defn- recompute-expanding-entities!
  "Clear the dependency status versions of the entities whose native SQL expands the `entity-type` entity `entity-id`,
  directly or through the entities of the same kind that include it, so they are computed again."
  [entity-type entity-id]
  (let [graph     (models.dependency/filtered-graph-dependents nil {:types expanded-into-dependents})
        type->ids (models.dependency/group-nodes (graph/transitive graph [[entity-type entity-id]]))]
    (deps.dependency-status/clear-version! (apply dissoc type->ids expanded-into-dependents))))

(defn- reprocess-new-dependent!
  "Re-analyze the entity `entity-type` `entity-id`, and re-derive it when it is a card, since the jobs may have
  processed the entities it newly depends on before its dependencies existed."
  [entity-type entity-id]
  (dependencies.db/clear-finding-version! entity-type entity-id)
  (when (= :card entity-type)
    (deps.result-metadata/rederive-dependent! [entity-type entity-id]))
  (task.analysis-finding/trigger-analysis-finding-job!))

(defn- compute-deps-for-entity!
  "Compute and store the dependencies of an entity and record the version they were computed from, flagging the tables
  it names that match nothing; for an entity that native SQL expands, have those that expand it computed again, and
  have it processed again when it newly depends on an entity, recording `version` as the one they were computed from. Entities are expected to be pre-hydrated by [[deps.dependency-status/hydrate-for-deps]]."
  [entity-type entity version]
  (log/debug "Computing dependencies for" (name entity-type) (:id entity))
  (when (expanded-into-dependents entity-type)
    (recompute-expanding-entities! entity-type (:id entity)))
  (let [all-deps (deps.calculation/calculate-deps entity-type entity)
        deps     (dissoc all-deps :unresolved-table)
        upstream (models.dependency/new-dependencies entity-type (:id entity) deps)]
    (t2/with-transaction [_]
      (models.dependency/replace-dependencies! entity-type (:id entity) deps)
      (post-deps-cleanup! entity-type entity)
      (deps.dependency-status/upsert-status! entity-type (:id entity) version (contains? all-deps :unresolved-table)))
    (when (seq upstream)
      (reprocess-new-dependent! entity-type (:id entity)))))

(defn- remove-deleted-entity-batch!
  "Drop the dependencies and status of up to `batch-size` deleted entities of `entity-type`, returning how many were
  removed."
  [entity-type batch-size]
  (let [entity-ids (dependencies.db/deleted-status-entity-ids :model/DependencyStatus entity-type batch-size)]
    (when (seq entity-ids)
      (t2/with-transaction [_]
        (dependencies.db/delete-dependencies-from! entity-type entity-ids)
        (dependencies.db/delete-statuses! :model/DependencyStatus entity-type entity-ids)))
    (count entity-ids)))

(defn- update-entity-batch!
  [entity-type batch-size]
  (lib-be/with-metadata-provider-cache
    (let [type-name (name entity-type)
          instances (processable-instances entity-type batch-size)]
      (when (seq instances)
        (log/infof "Processing a batch of %s %s(s)..." (count instances) type-name))
      (reduce (fn [total [entity version]]
                (+ total
                   (try
                     (compute-deps-for-entity! entity-type entity version)
                     1
                     (catch Throwable e ;; catch OOMs
                       (let [id (:id entity)]
                         (try
                           (deps.dependency-status/upsert-status! entity-type id version false)
                           (log/errorf "Entity %s %s failed, so its dependencies are computed again when it changes: %s"
                                       type-name id (ex-message e))
                           (catch Exception record-ex
                             (log/errorf "Entity %s %s failed during dependency calculation: %s"
                                         type-name id (ex-message e))
                             (log/errorf "Additionally, failed to record the failure for %s %s: %s"
                                         type-name id (ex-message record-ex)))))
                       (when-not (instance? Exception e) ;; re-throw Errors
                         (throw e))
                       0))))
              0
              instances))))

(defn- update-dependencies!
  "Job to update the dependencies of all entities. Returns true if a full batch has been selected, nil or false
  otherwise."
  []
  (when (premium-features/has-feature? :dependencies)
    (let [batch-size (deps.settings/dependency-backfill-batch-size)
          remaining  (reduce (fn [remaining entity-type]
                               (if (< remaining 1)
                                 (reduced 0)
                                 (let [removed   (remove-deleted-entity-batch! entity-type remaining)
                                       processed (if (< removed remaining)
                                                   (update-entity-batch! entity-type (- remaining removed))
                                                   0)]
                                   (when (pos? processed)
                                     (log/info "Updated" processed "entities."))
                                   (- remaining removed processed))))
                             batch-size
                             entity-types)]
      (when (< remaining batch-size)
        (task.analysis-finding/trigger-analysis-finding-job!))
      (< remaining 1))))

(declare ^:private job)

(defn- run-batch!
  "Process a batch, returning when to run again: right away when the batch was full, or nil."
  []
  (when (update-dependencies!)
    1))

(defn- log-job-start
  [^JobExecutionContext ctx]
  (let [scheduler (.getScheduler ctx)
        job-key (.getKey (.getJobDetail ctx))
        job-class (.getSimpleName (.getJobClass (.getJobDetail ctx)))
        active-triggers-count (try (count (qs/get-triggers-of-job scheduler job-key)) (catch Exception _))]
    (log/infof "Executing %s job. %s total triggers active." job-class active-triggers-count)))

(task/defjob UpdateDependencies
  "Update the dependency table."
  {:saved-class "metabase_enterprise.dependencies.task.backfill.BackfillDependencies"
   :concurrent? false}
  [ctx]
  (let [ctx ^JobExecutionContext ctx]
    (log-job-start ctx)
    (task.util/run-and-reschedule! (.getScheduler ctx) job)))

(def ^:private job
  {:job-type         UpdateDependencies
   :job-key          "metabase.task.dependency-backfill.job"
   :trigger-key      "metabase.task.dependency-backfill.trigger"
   :job-name         "Update Dependencies"
   :batch-size       deps.settings/dependency-backfill-batch-size
   :delay-minutes    deps.settings/dependency-backfill-delay-minutes
   :variance-minutes deps.settings/dependency-backfill-variance-minutes
   :run-batch!       #'run-batch!})

(defn trigger-dependency-job!
  "Trigger the UpdateDependencies job, unless MB_DEPENDENCY_BACKFILL_BATCH_SIZE=0 disables it."
  []
  (task.util/trigger-run! job))

(defmethod task/init! ::UpdateDependencies [_]
  (task.util/init-job! job))
