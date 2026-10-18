(ns metabase-enterprise.dependencies.task.util
  "The scheduling the dependencies module's self-rescheduling jobs share. Each job is described by a map of its
  `:job-type`, `:job-key`, `:trigger-key` and `:job-name`, the getters of its `:batch-size`, `:delay-minutes` and
  `:variance-minutes` settings, and `:run!`, which processes a batch and returns how many seconds from now to run
  again, or nil to stop."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.util Date)
   (org.quartz Scheduler)))

(set! *warn-on-reflection* true)

(defn- job-delay
  "A random delay in seconds between `delay - variance` and `delay + variance` minutes."
  [delay variance]
  (let [delay-duration    (t/duration delay :minutes)
        variance-duration (t/duration variance :minutes)]
    (max 0 (.. delay-duration
               (minus variance-duration)
               (plusSeconds (rand-int (.. variance-duration
                                          (multipliedBy 2)
                                          toSeconds)))
               toSeconds))))

(defn next-run-delay
  "A random delay in seconds before the next periodic run of `job`, within its variance of its delay."
  [{:keys [delay-minutes variance-minutes]}]
  (job-delay (delay-minutes) (variance-minutes)))

(defn feature-not-revoked?
  "Whether the dependencies feature is enabled or its status is unknown, so that a token check failing, which
  `has-feature?` cannot tell from an unlicensed instance, never stops a job for good."
  []
  (not (false? (premium-features/canonically-has-feature? :dependencies))))

(defn- next-fire-time
  "When the trigger with `trigger-key` fires next on `scheduler`, or nil when it is not pending."
  ^Date [^Scheduler scheduler trigger-key]
  (some-> scheduler (.getTrigger (triggers/key trigger-key)) .getNextFireTime))

(def ^:private schedule-lock
  "The lock that makes reading and replacing a job's pending trigger one step for this instance."
  (Object.))

(defn schedule-run!
  "Schedule a run of `job` `delay-in-seconds` from now on `scheduler`, unless a run is already pending before then."
  [scheduler {:keys [job-type job-key trigger-key job-name]} delay-in-seconds]
  (locking schedule-lock
    (let [start-at (-> (t/instant)
                       (t/+ (t/duration delay-in-seconds :seconds))
                       Date/from)
          pending  (next-fire-time scheduler trigger-key)]
      (if (and pending (not (.after pending start-at)))
        (log/debug "Keeping the run of job" job-name "already pending at" pending)
        (let [trigger (triggers/build
                       (triggers/with-identity (triggers/key trigger-key))
                       (triggers/for-job job-key)
                       (triggers/start-at start-at))
              job     (jobs/build (jobs/of-type job-type) (jobs/with-identity job-key))]
          (log/info "Scheduling next run of job" job-name "at" start-at)
          (task/schedule-task! scheduler job trigger))))))

(defn run-and-reschedule!
  "Run a batch of `job`, then schedule its next run when the batch asks for one, and after [[next-run-delay]] when it
  throws, before rethrowing, since nothing else restarts a job that stopped."
  [scheduler {:keys [run! job-name] :as job}]
  (try
    (if-some [delay-in-seconds (run!)]
      (schedule-run! scheduler job delay-in-seconds)
      (log/info "Job" job-name "has nothing more to do, stopping."))
    (catch Throwable e
      (schedule-run! scheduler job (next-run-delay job))
      (throw e))))

(defn trigger-run!
  "Schedule a run of `job` a second from now, once the triggering write has committed, unless a batch size that isn't
  positive disables it."
  [{:keys [batch-size] :as job}]
  (when (pos? (batch-size))
    (schedule-run! (task/scheduler) job 1)))

(defn init-job!
  "Schedule the first run of `job` after startup, at a random time within its variance."
  [{:keys [batch-size variance-minutes job-name] :as job}]
  (when-not (pos? (batch-size))
    (log/info "The batch size of job" job-name "is not positive; the job will run but process nothing"))
  (schedule-run! (task/scheduler) job (rand-int (.toSeconds (t/duration (variance-minutes) :minutes)))))
