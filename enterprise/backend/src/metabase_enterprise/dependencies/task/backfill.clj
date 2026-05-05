(ns metabase-enterprise.dependencies.task.backfill
  "Implements a task that brings all entities with dependencies tracked in the dependency table
  (see [[metabase-enterprise.dependencies.models.dependency]]) up to date, that is, makes sure
  the dependency table contains fresh entries.

  This is done by querying the dependency_status table for entities that are stale or have an
  outdated dependency_analysis_version. The backfill task computes dependencies and updates
  the dependency_status table."
  (:require
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entity-types
  "The list of entity types to backfill.

  This is not the same as deps.dependency-types/dependency-types, because tables shouldn't be backfilled.  Instead, links
  involving tables are found via analysis of the other side of the relation."
  [:card :transform :snippet :dashboard :document :sandbox :segment :measure])

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
  (let [type-name (name entity-type)
        instances (processable-instances entity-type batch-size)]
    (when (seq instances)
      (log/infof "Processing a batch of %s %s(s)..." (count instances) type-name))
    (reduce (fn [total entity]
              (+ total
                 (try
                   (compute-deps-for-entity! entity-type entity)
                   1
                   (catch Exception e
                     (let [id (:id entity)]
                       (try
                         (deps.dependency-status/record-failure!
                          entity-type id max-retries
                          (deps.settings/dependency-backfill-delay-minutes))
                         (let [{:keys [fail_count terminal]} (t2/select-one :model/DependencyStatus
                                                                            :entity_type entity-type
                                                                            :entity_id id)]
                           (if terminal
                             (log/errorf e "Entity %s %s failed %d times, marking as terminally broken."
                                         type-name id fail_count)
                             (log/warnf e "Entity %s %s failed, failure count: %d."
                                        type-name id fail_count)))
                         (catch Exception record-ex
                           (log/errorf e "Entity %s %s failed during dependency calculation."
                                       type-name id)
                           (log/errorf record-ex "Additionally, failed to record the failure for %s %s."
                                       type-name id))))
                     0))))
            0
            instances)))

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

(defn- has-pending-retries? []
  (deps.dependency-status/has-pending-retries?))

(declare schedule-next-run!)

(task/defjob
  ^{:doc "Backfill the dependency table."
    org.quartz.DisallowConcurrentExecution true}
  BackfillDependencies [ctx]
  (log/info "Executing BackfillDependencies job...")
  (let [full-batch-selected? (backfill-dependencies!)
        retries? (has-pending-retries?)]
    (if (or full-batch-selected?
            retries?)
      (let [delay-in-seconds (deps.task-util/job-delay
                              (deps.settings/dependency-backfill-delay-minutes)
                              (deps.settings/dependency-backfill-variance-minutes))]
        (schedule-next-run! delay-in-seconds (.getScheduler ctx)))
      (log/info "No more entities to backfill for, stopping."))))

(def ^:private job-key     "metabase.task.dependency-backfill.job")
(def ^:private trigger-key "metabase.task.dependency-backfill.trigger")

(defn- schedule-next-run!
  ([delay-in-seconds] (schedule-next-run! delay-in-seconds nil))
  ([delay-in-seconds scheduler]
   (deps.task-util/schedule-next-run!
    {:job-type         BackfillDependencies
     :job-name         "Dependency Backfill"
     :job-key          job-key
     :trigger-key      trigger-key
     :delay-in-seconds delay-in-seconds
     :scheduler        scheduler})))

(defn trigger-backfill-job!
  "Trigger the BackfillDependencies job to run after a brief delay.
  The 1-second delay ensures the calling transaction has committed before
  the job checks for stale entities."
  []
  (schedule-next-run! 1))

(defmethod task/init! ::DependencyBackfill [_]
  (if (pos? (deps.settings/dependency-backfill-batch-size))
    (schedule-next-run! (deps.task-util/job-initial-delay
                         (deps.settings/dependency-backfill-variance-minutes)))
    (log/info "Not starting dependency backfill job because the batch size is not positive")))

(derive ::backfill :metabase/event)
(derive :event/serdes-load ::backfill)
(derive :event/set-premium-embedding-token ::backfill)

(methodical/defmethod events/publish-event! ::backfill
  [_ _]
  (when (premium-features/has-feature? :dependencies)
    (trigger-backfill-job!)))
