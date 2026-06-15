(ns metabase-enterprise.dependencies.task.entity-check
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- process-one-batch!
  "Process one batch across all analyzable entity types. Returns the set of `[entity-type id]`
  pairs processed in this batch."
  []
  ;; Thread the remaining budget and the accumulated id-set through one accumulator; stop early
  ;; once the budget is spent.
  (:processed
   (reduce (fn [{:keys [budget] :as acc} entity-type]
             (if (< budget 1)
               (reduced acc)
               (let [ids (deps.findings/analyze-batch! entity-type budget)]
                 (when (seq ids)
                   (log/info "Updated" (count ids) "entities of type" entity-type))
                 (-> acc
                     (update :budget - (count ids))
                     (update :processed into (map (fn [id] [entity-type id])) ids)))))
           {:budget (deps.settings/dependency-entity-check-batch-size) :processed #{}}
           deps.findings/analyzable-entities)))

(defn- check-entities!
  "Drain stale/outdated entities until the run converges, then return.

  Guaranteed to terminate even when the dependency graph contains a cycle or an entity that can
  never clear its stale flag — earlier this could spin until the instance ran out of memory
  (#75748)."
  []
  (when (premium-features/has-feature? :dependencies)
    ;; Each pass analyzes a batch and (via analyze-and-propagate!) marks the dependents of *changed*
    ;; entities stale, to be picked up next pass. `seen` bounds the run: it grows monotonically and
    ;; is capped by the entity count, and we recur only while a batch turns up an entity not already
    ;; analyzed this run — so a cycle (or an unclearable entity) re-treads `seen` and stops.
    (loop [seen #{}]
      (let [processed (process-one-batch!)]
        (when (some (complement seen) processed)
          (recur (into seen processed)))))))

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
