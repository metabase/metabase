(ns metabase-enterprise.dependencies.task.entity-check
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

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
  "Drain the currently-stale entities, analyzing each one.

  Staleness is propagated up front, at the moment an entity changes (see the dependencies event handlers, which mark the
  whole affected subtree via [[deps.findings/mark-entity-and-transitive-dependents-stale!]]). The drain therefore works through a
  fixed set that only shrinks — it never re-marks anything stale during draining — so it always terminates, even when the
  dependency graph has cycles.

  As a safety net, the loop also stops as soon as a pass fails to reduce the stale count (e.g. an entity whose analysis
  can't be persisted). That keeps a single unprocessable entity from spinning the loop forever; the next scheduled run
  retries it."
  []
  (when (premium-features/has-feature? :dependencies)
    (loop [prev-stale nil]
      (process-one-batch!)
      (let [stale (deps.analysis-finding/stale-entity-count)]
        (when (and (pos? stale)
                   (or (nil? prev-stale) (< stale prev-stale)))
          (recur stale))))))

(declare schedule-run!)

(defn- reschedule-after-run!
  "Schedule the next periodic run of the entity check job, unless the `:dependencies` feature is absent.

  Unlike the backfill job this one has no terminal state — it is a periodic checker, so while licensed it always queues
  another run rather than stopping once the stale set is drained. Without the feature there is nothing the next run
  could do, since [[check-entities!]] is gated on it, so rescheduling would just wake the instance forever. The job
  restarts from the token event above, from the content-change handlers, or on the next restart.

  Scheduling deliberately fails open on an indeterminate token status: `has-feature?` cannot tell a network failure
  from being unlicensed, and nothing re-fires when the check later succeeds, so reading a blip as `false` would end
  the chain for good. Only a definitive `false` stops it — which is the common unlicensed case, since no token at all
  answers `false`. A token that cannot be validated answers `nil` and keeps the job scheduled: if there is a token, we
  keep trying. Doing the work still fails closed — see [[check-entities!]]."
  [scheduler]
  (if (false? (premium-features/canonically-has-feature? :dependencies))
    (log/debug "Not rescheduling job Dependency Entity Check: the dependencies feature is not enabled")
    (schedule-run! scheduler
                   (deps.task-util/job-delay
                    (deps.settings/dependency-entity-check-delay-minutes)
                    (deps.settings/dependency-entity-check-variance-minutes)))))

(task/defjob
  ^{:doc "Check all entities for validity"
    org.quartz.DisallowConcurrentExecution true}
  DependencyEntityCheck [ctx]
  (log/info "Executing DependencyEntityCheck job...")
  (check-entities!)
  (reschedule-after-run! (.getScheduler ctx)))

(def ^:private job-key     "metabase.dependencies.task.entity-check.job")
(def ^:private trigger-key "metabase.dependencies.task.entity-check.trigger")

(defn- schedule-run!
  "Schedule a run of the entity check job `delay-in-seconds` from now."
  [scheduler delay-in-seconds]
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
  (when-not (pos? (deps.settings/dependency-entity-check-batch-size))
    (log/info "Dependency entity check batch size is not positive; the job will run but process nothing"))
  (schedule-run!
   (task/scheduler)
   (deps.task-util/job-initial-delay
    (deps.settings/dependency-entity-check-variance-minutes))))

(defn trigger-entity-check-job!
  "Trigger the DependencyEntityCheck job to run after a brief delay, unless the batch size disables it.

  The 1-second delay ensures the calling transaction has committed before the job checks for stale entities. Entity
  changes fire this, so leaving it ungated is what made a disabled job wake roughly once a second; the job's own
  periodic schedule is left alone so it still resumes if the batch size becomes positive.

  Disable with MB_DEPENDENCY_ENTITY_CHECK_BATCH_SIZE=0"
  []
  (when (pos? (deps.settings/dependency-entity-check-batch-size))
    (schedule-run! (task/scheduler) 1)))

;;; Mirrors the backfill job's wiring: enabling the feature has to restart the job, because
;;; [[reschedule-after-run!]] stops the periodic chain while it is disabled and the content-change handlers that
;;; would otherwise revive it are themselves gated on the feature.
(events/derive! ::entity-check :metabase/event)
(events/derive! :event/set-premium-embedding-token ::entity-check)

(methodical/defmethod events/publish-event! ::entity-check
  [_ _]
  (when (premium-features/has-feature? :dependencies)
    (trigger-entity-check-job!)))
