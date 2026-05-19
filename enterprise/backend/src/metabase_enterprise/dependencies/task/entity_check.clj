(ns metabase-enterprise.dependencies.task.entity-check
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- process-one-batch!
  "Process one batch of entities. Returns true if the full batch was used."
  []
  (-> (reduce (fn [batch-size entity-type]
                (if (< batch-size 1)
                  (reduced 0)
                  (let [processed (deps.findings/analyze-batch! entity-type batch-size)]
                    (when (pos? processed)
                      (log/info "Updated" processed "entities of type" entity-type))
                    (- batch-size processed))))
              (deps.settings/dependency-entity-check-batch-size)
              deps.findings/analyzable-entities)
      (< 1)))

(defn- check-entities!
  "Process entities, draining all stale entities before returning.
  Continues looping as long as there are stale entities — this is important because
  [[deps.findings/analyze-and-propagate!]] marks immediate dependents stale during processing,
  which need to be picked up in subsequent waves."
  []
  (when (premium-features/has-feature? :dependencies)
    (loop []
      (process-one-batch!)
      (when (deps.analysis-finding/has-stale-entities?)
        (recur)))))

(declare schedule-run!)

(task/defjob
  ^{:doc "Check all entities for validity"
    org.quartz.DisallowConcurrentExecution true}
  DependencyEntityCheck [ctx]
  (log/info "Executing DependencyEntityCheck job...")
  (check-entities!)
  (let [delay-in-seconds (deps.task-util/job-delay
                          (deps.settings/dependency-entity-check-delay-minutes)
                          (deps.settings/dependency-entity-check-variance-minutes))]
    (schedule-run! (.getScheduler ctx) delay-in-seconds)))

(def ^:private job-key     "metabase.dependencies.task.entity-check.job")
(def ^:private trigger-key "metabase.dependencies.task.entity-check.trigger")

(defn- schedule-run! [scheduler delay-in-seconds]
  (let [start-at (-> (t/instant)
                     (t/+ (t/duration delay-in-seconds :seconds))
                     java.util.Date/from)
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/for-job job-key)
                  (triggers/start-at start-at))
        job      (jobs/build (jobs/of-type DependencyEntityCheck) (jobs/with-identity job-key))]
    (log/info "Scheduling next run of job Dependency Entity Check at" start-at)
    (task/schedule-task! scheduler job trigger)))

(defmethod task/init! ::DependencyEntityCheck [_]
  (if (pos? (deps.settings/dependency-entity-check-batch-size))
    (schedule-run!
     (task/scheduler)
     (deps.task-util/job-initial-delay
      (deps.settings/dependency-entity-check-variance-minutes)))
    (log/info "Not starting dependency entity check job because the batch size is not positive")))

(defn trigger-entity-check-job!
  "Trigger the DependencyEntityCheck job to run after a brief delay.
  The 1-second delay ensures the calling transaction has committed before
  the job checks for stale entities."
  []
  (schedule-run! (task/scheduler) 1))
