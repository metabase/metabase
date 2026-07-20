(ns metabase.run-tracking.task
  "Quartz job and scheduler primitives for run-tracking reapers."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log])
  (:import
   (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

;; One Quartz job class serves every reaper; each clustered job resolves its reap-fn by job key.
;; `task/init!` methods run on every node before its scheduler starts, so the registry is always
;; populated before a trigger can fire locally.
(defonce ^:private reapers (atom {}))

(task/defjob ^{:doc "Reap orphaned (stale-heartbeat) runs for a registered run model."
               org.quartz.DisallowConcurrentExecution true}
  RunTrackingReaper [ctx]
  (let [job-key (.. ^JobExecutionContext ctx getJobDetail getKey getName)
        {:keys [reap-fn label]} (@reapers job-key)]
    (when-let [reaped (and reap-fn (not-empty (reap-fn)))]
      (log/infof "Reaped %d orphaned %s(s) with stale heartbeats." (count reaped) label))))

(defn schedule-reaper!
  "Register and schedule the clustered orphan-reaper job `job-key`: every `interval-minutes` (default 1)
  it calls `reap-fn` (which returns the reaped rows) and logs a summary naming the rows `label`.
  No-op if `job-key` is already scheduled. Call from a `task/init!` method."
  [{:keys [job-key reap-fn label interval-minutes] :or {interval-minutes 1}}]
  (swap! reapers assoc job-key {:reap-fn reap-fn :label label})
  (when-not (task/job-exists? job-key)
    (let [job     (jobs/build
                   (jobs/of-type RunTrackingReaper)
                   (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes interval-minutes)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defn start-heartbeat!
  "Call `heartbeat-fn` now and then every `interval-minutes`, on a dedicated daemon (virtual) thread.
  Returns a future; cancel it to stop the heartbeat. Call from a `task/init!` method."
  [heartbeat-fn interval-minutes]
  (u.jvm/in-virtual-thread*
   (try
     (loop []
       (try
         (heartbeat-fn)
         (catch InterruptedException e (throw e))
         (catch Throwable t
           (log/error t "Error sending run-tracking heartbeat")))
       (Thread/sleep (long (u/minutes->ms interval-minutes)))
       (recur))
     (catch InterruptedException _ nil))))
