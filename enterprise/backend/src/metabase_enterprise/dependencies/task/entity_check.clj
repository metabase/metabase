(ns metabase-enterprise.dependencies.task.entity-check
  (:require
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
              deps.findings/supported-entities)
      (< 1)))

(defn- check-entities!
  "Process entities, draining all stale entities before returning.
  Returns true if the full batch was used (more work may remain)."
  []
  (when (premium-features/has-feature? :dependencies)
    (loop []
      (let [used-full-batch? (process-one-batch!)]
        (if (and used-full-batch? (deps.analysis-finding/has-stale-entities?))
          (recur)
          used-full-batch?)))))

(declare schedule-next-run!)

(task/defjob
  ^{:doc "Check all entities for validity"
    org.quartz.DisallowConcurrentExecution true}
  DependencyEntityCheck [ctx]
  (log/info "Executing DependencyEntityCheck job...")
  (check-entities!)
  (let [delay-in-seconds (deps.task-util/job-delay
                          (deps.settings/dependency-entity-check-delay-minutes)
                          (deps.settings/dependency-entity-check-variance-minutes))]
    (schedule-next-run! delay-in-seconds (.getScheduler ctx))))

(def ^:private job-key     "metabase.dependencies.task.entity-check.job")
(def ^:private trigger-key "metabase.dependencies.task.entity-check.trigger")

(defn- schedule-next-run!
  ([delay-in-seconds] (schedule-next-run! delay-in-seconds nil))
  ([delay-in-seconds scheduler]
   (deps.task-util/schedule-next-run!
    {:job-type         DependencyEntityCheck
     :job-name         "Dependency Entity Check"
     :job-key          job-key
     :trigger-key      trigger-key
     :delay-in-seconds delay-in-seconds
     :scheduler        scheduler})))

(defmethod task/init! ::DependencyEntityCheck [_]
  (if (pos? (deps.settings/dependency-entity-check-batch-size))
    (-> (deps.settings/dependency-entity-check-variance-minutes)
        deps.task-util/job-initial-delay
        schedule-next-run!)
    (log/info "Not starting dependency entity check job because the batch size is not positive")))

(defn trigger-entity-check-job!
  "Trigger the DependencyEntityCheck job to run immediately.
  Use this when entities have been marked stale and need re-analysis."
  []
  (schedule-next-run! 0))
