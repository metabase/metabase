(ns metabase-enterprise.dependencies.task.dependency
  "Implements a task that brings all entities with dependencies tracked in the dependency table
  (see [[metabase-enterprise.dependencies.models.dependency]]) up to date, that is, makes sure
  the dependency table contains fresh entries.

  It claims the entities whose dependency_status is stale, records an older analysis_version, or is missing, clearing
  their stale flags, then computes their dependencies; a write while they are computed marks them stale again."
  (:require
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private entity-types
  "The list of entity types whose dependencies the job computes, snippets first, so that the snippets the entities
  using them expand are known when those are computed.

  This is not the same as deps.dependency-types/dependency-types, because tables have no dependencies of their
  own. Instead, links involving tables are found via analysis of the other side of the relation."
  (vec (sort-by #(not= :snippet %) deps.dependency-types/backfillable-dependency-types)))

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

(defn- claim-hydrated-entities!
  "Claim up to `batch-size` entities of `entity-type` whose dependencies need computing, hydrated."
  [entity-type batch-size]
  (deps.dependency-status/hydrate-for-deps
   entity-type (deps.dependency-status/claim-pending-entities! entity-type batch-size)))

(defn- compute-deps-for-entity!
  "Compute and store the dependencies of an `entity` hydrated by [[deps.dependency-status/hydrate-for-deps]], marking
  a card with a new upstream stale for its result metadata, which an upstream change made before the edge existed
  never marked."
  [entity-type entity]
  (log/debug "Computing dependencies for" (name entity-type) (:id entity))
  (let [deps (deps.calculation/calculate-deps entity-type entity)]
    (t2/with-transaction [_]
      (when (and (= :card entity-type)
                 (seq (models.dependency/new-dependencies entity-type (:id entity) deps)))
        (dependencies.db/mark-result-metadata-statuses-stale! {:card #{(:id entity)}}))
      (models.dependency/replace-dependencies! entity-type (:id entity) deps)
      (post-deps-cleanup! entity-type entity))))

(defn- remove-deleted-entity-batch!
  "Drop the dependencies and status of up to `batch-size` deleted entities of `entity-type`, returning how many were
  removed."
  [entity-type batch-size]
  (let [entity-ids (dependencies.db/dependency-deleted-entity-ids entity-type batch-size)]
    (when (seq entity-ids)
      (t2/with-transaction [_]
        (dependencies.db/delete-dependencies-from! entity-type entity-ids)
        (dependencies.db/delete-dependency-statuses! entity-type entity-ids)))
    (count entity-ids)))

(defn- update-entity-batch!
  [entity-type batch-size]
  (lib-be/with-metadata-provider-cache
    (let [type-name (name entity-type)
          entities  (claim-hydrated-entities! entity-type batch-size)]
      (when (seq entities)
        (log/debugf "Processing a batch of %s %s(s)..." (count entities) type-name))
      (doseq [entity entities]
        (try
          (compute-deps-for-entity! entity-type entity)
          (catch Throwable e ;; catch OOMs
            (log/errorf "Entity %s %s failed, so its dependencies are computed again when it changes: %s"
                        type-name (:id entity) (ex-message e))
            (when-not (instance? Exception e) ;; re-throw Errors
              (throw e)))))
      (count entities))))

(defn- update-dependencies!
  "Update the dependencies of up to a batch of entities, triggering the jobs that read them, and return whether the
  batch took any."
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
                                     (log/debug "Updated" processed "entities."))
                                   (- remaining removed processed))))
                             batch-size
                             entity-types)]
      (when (< remaining batch-size)
        (task.analysis-finding/trigger-analysis-finding-job!)
        (task.result-metadata/trigger-result-metadata-job!)
        true))))

(declare ^:private job)

(defn- run-batch!
  "Process a batch, returning when to run again: a second from now when it took any, or nil."
  []
  (when (update-dependencies!)
    1))

(defn- log-job-start
  [^JobExecutionContext ctx]
  (let [scheduler (.getScheduler ctx)
        job-key (.getKey (.getJobDetail ctx))
        job-class (.getSimpleName (.getJobClass (.getJobDetail ctx)))
        active-triggers-count (try (count (qs/get-triggers-of-job scheduler job-key)) (catch Exception _))]
    (log/debugf "Executing %s job. %s total triggers active." job-class active-triggers-count)))

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
  "Trigger the UpdateDependencies job, unless a MB_DEPENDENCY_BACKFILL_BATCH_SIZE that isn't positive
  disables it."
  []
  (task.util/trigger-run! job))

(defmethod task/init! ::UpdateDependencies [_]
  (task.util/init-job! job))
