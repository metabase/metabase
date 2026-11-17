(ns metabase-enterprise.dependencies.task.util
  "The scheduling the dependencies module's self-rescheduling jobs share, each job described by a map of its
  `:job-type`, `:job-key`, `:trigger-key` and `:job-name`, the getters of its `:batch-size`, `:delay-minutes` and
  `:variance-minutes` settings, and `:run-batch!`, which processes a batch and returns how many seconds from now to
  run again, or nil to stop."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.util Date)
   (org.quartz Scheduler)))

(set! *warn-on-reflection* true)

(def ^:private Job
  "A self-rescheduling job, as the namespace docstring describes it."
  [:map {:closed true}
   [:job-type         [:fn {:error/message "a job class"} class?]]
   [:job-key          :string]
   [:trigger-key      :string]
   [:job-name         :string]
   [:batch-size       [:fn {:error/message "a setting getter"} ifn?]]
   [:delay-minutes    [:fn {:error/message "a setting getter"} ifn?]]
   [:variance-minutes [:fn {:error/message "a setting getter"} ifn?]]
   [:run-batch!       [:fn {:error/message "a function"} ifn?]]])

(def ^:private MaybeScheduler
  "A Quartz scheduler, or nil when none is running."
  [:maybe (ms/InstanceOfClass Scheduler)])

(mu/defn- job-delay :- ms/IntGreaterThanOrEqualToZero
  "A random delay in seconds between `delay - variance` and `delay + variance` minutes."
  [delay    :- :int
   variance :- :int]
  (let [delay-duration    (t/duration delay :minutes)
        variance-duration (t/duration variance :minutes)]
    (max 0 (.. delay-duration
               (minus variance-duration)
               (plusSeconds (rand-int (.. variance-duration
                                          (multipliedBy 2)
                                          toSeconds)))
               toSeconds))))

(mu/defn next-run-delay :- ms/IntGreaterThanOrEqualToZero
  "A random delay in seconds before `job` runs again after a failure, within its variance of its delay."
  [{:keys [delay-minutes variance-minutes]} :- Job]
  (job-delay (delay-minutes) (variance-minutes)))

(mu/defn- next-fire-time :- [:maybe (ms/InstanceOfClass Date)]
  "When the trigger with `trigger-key` fires next on `scheduler`, or nil when it is not pending."
  ^Date [^Scheduler scheduler :- MaybeScheduler
         trigger-key          :- :string]
  (some-> scheduler (.getTrigger (triggers/key trigger-key)) .getNextFireTime))

(def ^:private schedule-lock
  "The lock that makes reading and replacing a job's pending trigger one step for this instance."
  (Object.))

(mu/defn schedule-run! :- :any
  "Schedule a run of `job` `delay-in-seconds` from now on `scheduler`, leaving a run already pending before then in
  place, or a second from now when that pending run is past due, since Quartz can leave a trigger past due for
  minutes."
  [scheduler                                        :- MaybeScheduler
   {:keys [job-type job-key trigger-key job-name]} :- Job
   delay-in-seconds                                 :- ms/IntGreaterThanOrEqualToZero]
  (locking schedule-lock
    (let [now      (t/instant)
          start-at (t/+ now (t/duration delay-in-seconds :seconds))
          pending  (some-> (next-fire-time scheduler trigger-key) .toInstant)]
      (when-not (and pending (t/after? pending now) (not (t/after? pending start-at)))
        (let [start-at (Date/from (if (or (nil? pending) (t/after? pending start-at))
                                    start-at
                                    (t/+ now (t/duration 1 :seconds))))
              trigger  (triggers/build
                        (triggers/with-identity (triggers/key trigger-key))
                        (triggers/for-job job-key)
                        (triggers/start-at start-at))
              job      (jobs/build (jobs/of-type job-type) (jobs/with-identity job-key))]
          (log/debug "Scheduling next run of job" job-name "at" start-at)
          (task/schedule-task! scheduler job trigger))))))

(mu/defn run-and-reschedule! :- :any
  "Run a batch of `job` unless a batch size that isn't positive disables it, then schedule its next run when the batch
  asks for one, and after [[next-run-delay]] when it throws, before rethrowing, so a failure doesn't stop it until the
  next write."
  [scheduler                                     :- MaybeScheduler
   {:keys [run-batch! job-name batch-size] :as job} :- Job]
  (if (pos? (batch-size))
    (try
      (if-some [delay-in-seconds (run-batch!)]
        (schedule-run! scheduler job delay-in-seconds)
        (log/debug "Job" job-name "has nothing more to do, stopping."))
      (catch Throwable e
        (schedule-run! scheduler job (next-run-delay job))
        (throw e)))
    (log/debug "Job" job-name "has a batch size that isn't positive, stopping.")))

(mu/defn trigger-run! :- :any
  "Schedule a run of `job` a second from now, unless a batch size that isn't positive disables it."
  [{:keys [batch-size] :as job} :- Job]
  (when (pos? (batch-size))
    (schedule-run! (task/scheduler) job 1)))

(mu/defn init-job! :- :any
  "Schedule the first run of `job` after startup, at a random time within its variance, unless a batch size that isn't
  positive disables it."
  [{:keys [batch-size variance-minutes job-name] :as job} :- Job]
  (if (pos? (batch-size))
    (schedule-run! (task/scheduler) job (rand-int (.toSeconds (t/duration (variance-minutes) :minutes))))
    (log/info "The batch size of job" job-name "is not positive; the job is disabled")))
