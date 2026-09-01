(ns metabase-enterprise.dependencies.task.backfill
  "Implements a task that brings all entities with dependencies tracked in the dependency table
  (see [[metabase-enterprise.dependencies.models.dependency]]) up to date, that is, makes sure
  the dependency table contains fresh entries.

  This is done by querying the dependency_status table for entities that are stale or have an
  outdated dependency_analysis_version. The backfill task computes dependencies and updates
  the dependency_status table."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private entity-types
  "The list of entity types to backfill.

  This is not the same as deps.dependency-types/dependency-types, because tables shouldn't be backfilled.  Instead, links
  involving tables are found via analysis of the other side of the relation."
  (vec deps.dependency-types/backfillable-dependency-types))

(def ^:private max-retries 5)

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
        downstream-table-ids (t2/select-fn-set :from_entity_id :model/Dependency
                                               :from_entity_type :table
                                               :to_entity_type   :transform
                                               :to_entity_id     id)
        downstream-tables    (when (seq downstream-table-ids)
                               (t2/select :model/Table :id [:in downstream-table-ids]))
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
      (t2/delete! :model/Dependency
                  :from_entity_type :table
                  :from_entity_id   [:in outdated-downstream-table-ids]
                  :to_entity_type   :transform
                  :to_entity_id     id))))

;;; ------------------------------ Backfill orchestration ------------------------------

(defn- processable-instances [entity-type batch-size]
  (deps.dependency-status/hydrate-for-deps
   entity-type
   (deps.dependency-status/instances-for-dependency-calculation entity-type batch-size)))

(defn- compute-deps-for-entity!
  "Compute and store dependencies for an entity, then update its dependency_status.
  Entities are expected to be pre-hydrated by [[deps.dependency-status/hydrate-for-deps]]."
  [entity-type entity]
  (log/debug "Computing dependencies for" (name entity-type) (:id entity))
  (t2/with-transaction [_]
    (let [deps (deps.calculation/calculate-deps entity-type entity)]
      (models.dependency/replace-dependencies! entity-type (:id entity) deps)
      (post-deps-cleanup! entity-type entity)
      (deps.dependency-status/upsert-status! entity-type (:id entity)))))

(defn- backfill-entity-batch!
  [entity-type batch-size]
  (lib-be/with-metadata-provider-cache
    (let [type-name (name entity-type)
          instances (processable-instances entity-type batch-size)]
      (when (seq instances)
        (log/infof "Processing a batch of %s %s(s)..." (count instances) type-name))
      (reduce (fn [total entity]
                (+ total
                   (try
                     (compute-deps-for-entity! entity-type entity)
                     1
                     (catch Throwable e ;; catch OOMs
                       (let [id (:id entity)]
                         (try
                           (deps.dependency-status/record-failure!
                            entity-type id max-retries
                            (deps.settings/dependency-backfill-delay-minutes))
                           (let [{:keys [fail_count terminal]} (t2/select-one :model/DependencyStatus
                                                                              :entity_type entity-type
                                                                              :entity_id id)]
                             (if terminal
                               (log/errorf "Entity %s %s failed %d times, marking as terminally broken: %s"
                                           type-name id fail_count (ex-message e))
                               (log/warnf "Entity %s %s failed, failure count: %d. %s"
                                          type-name id fail_count (ex-message e))))
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

(defn- backfill-dependencies!
  "Job to backfill dependencies for all entities.
  Returns true if a full batch has been selected, nil or false otherwise."
  []
  (when (premium-features/has-feature? :dependencies)
    (-> (reduce (fn [batch-size entity-type]
                  (if (< batch-size 1)
                    (reduced 0)
                    (let [processed (backfill-entity-batch! entity-type batch-size)]
                      (when (pos? processed)
                        (log/info "Updated" processed "entities."))
                      (- batch-size processed))))
                (deps.settings/dependency-backfill-batch-size)
                entity-types)
        (< 1))))

(defn- has-pending-retries?
  "Whether any entity is in retry backoff that this instance can actually act on.

  Fails open on an indeterminate token status. `has-feature?` cannot tell a network failure from being unlicensed, and
  both inputs to the job's reschedule decision consult the licence, so reading a blip as `false` would stop the job
  for good — nothing re-fires when the check recovers, because the token never changed. Only a definitive `false`
  counts as unlicensed here — which is the common case, since no token at all answers `false`. A token that cannot be
  validated answers `nil` and keeps the job alive. Doing the work still fails closed — see
  [[backfill-dependencies!]]."
  []
  (and (not (false? (premium-features/canonically-has-feature? :dependencies)))
       (deps.dependency-status/has-pending-retries?)))

(declare schedule-run!)

(defn- next-run-delay []
  (deps.task-util/job-delay
   (deps.settings/dependency-backfill-delay-minutes)
   (deps.settings/dependency-backfill-variance-minutes)))

(defn- run-and-reschedule!
  "Process a batch, then schedule the next run if there is more to do.

  Reschedules on the way out of a failure too, then rethrows. This job is one-shot self-rescheduling with no cron
  backstop, so anything escaping the batch would otherwise end the chain until a content-change event or a restart —
  survivable for an `OutOfMemoryError` that takes the process with it, not for a `StackOverflowError` from
  pathological SQL that leaves a live process behind."
  [scheduler]
  (try
    (let [full-batch-selected? (backfill-dependencies!)
          retries?             (has-pending-retries?)]
      (if (or full-batch-selected? retries?)
        (schedule-run! scheduler (next-run-delay))
        (log/info "No more entities to backfill for, stopping.")))
    (catch Throwable e
      (schedule-run! scheduler (next-run-delay))
      (throw e))))

(defn- log-job-start
  [^JobExecutionContext ctx]
  (let [scheduler (.getScheduler ctx)
        job-key (.getKey (.getJobDetail ctx))
        job-class (.getSimpleName (.getJobClass (.getJobDetail ctx)))
        active-triggers-count (try (count (qs/get-triggers-of-job scheduler job-key)) (catch Exception _))]
    (log/infof "Executing %s job. %s total triggers active." job-class active-triggers-count)))

(task/defjob
  ^{:doc "Backfill the dependency table."
    org.quartz.DisallowConcurrentExecution true}
  BackfillDependencies [ctx]
  (let [ctx ^JobExecutionContext ctx]
    (log-job-start ctx)
    (run-and-reschedule! (.getScheduler ctx))))

(def ^:private job-key     "metabase.task.dependency-backfill.job")
(def ^:private trigger-key "metabase.task.dependency-backfill.trigger")

(defn- schedule-run!
  "Schedule a run of the backfill job `delay-in-seconds` from now."
  [scheduler delay-in-seconds]
  (let [start-at (-> (t/instant)
                     (t/+ (t/duration delay-in-seconds :seconds))
                     java.util.Date/from)
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/for-job job-key)
                  (triggers/start-at start-at))
        job      (jobs/build (jobs/of-type BackfillDependencies) (jobs/with-identity job-key))]
    (log/info "Scheduling next run of job Dependency Backfill at" start-at)
    (task/schedule-task! scheduler job trigger)))

(defn trigger-backfill-job!
  "Trigger the BackfillDependencies job to run after a brief delay, unless the batch size disables it.

  The 1-second delay ensures the calling transaction has committed before the job checks for stale entities. Entity
  changes fire this, so leaving it ungated is what made a disabled job wake roughly once a second; the job's own
  periodic schedule is left alone so it still resumes if the batch size becomes positive.

  Disable with MB_DEPENDENCY_BACKFILL_BATCH_SIZE=0"
  []
  (when (pos? (deps.settings/dependency-backfill-batch-size))
    (schedule-run! (task/scheduler) 1)))

(defmethod task/init! ::DependencyBackfill [_]
  (when-not (pos? (deps.settings/dependency-backfill-batch-size))
    (log/info "Dependency backfill batch size is not positive; the job will run but process nothing"))
  (schedule-run!
   (task/scheduler)
   (deps.task-util/job-initial-delay
    (deps.settings/dependency-backfill-variance-minutes))))

(events/derive! ::backfill :metabase/event)
(events/derive! :event/serdes-load ::backfill)
(events/derive! :event/set-premium-embedding-token ::backfill)

(methodical/defmethod events/publish-event! ::backfill
  [_ _]
  (when (premium-features/has-feature? :dependencies)
    (trigger-backfill-job!)))
