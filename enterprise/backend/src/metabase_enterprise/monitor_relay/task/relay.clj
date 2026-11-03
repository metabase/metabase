(ns metabase-enterprise.monitor-relay.task.relay
  "The Metabase Monitor relay's Quartz job. It runs one relay cycle every 10 s, on one node of the cluster at a time.
  A node with the scheduler disabled never runs it. On an H2 app DB there is no job."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.monitor-relay.config :as relay.config]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase-enterprise.monitor-relay.job"))

(def ^:private trigger-key (triggers/key "metabase-enterprise.monitor-relay.trigger"))

;; A timer from the end of this node's last run of the job, or nil before its first.
(defonce ^:private last-end (atom nil))

(defn- missed?
  "Whether the firing of `ctx` only catches up with this node's last run, which ended `since-end-ms` ago. For example,
  a run from 0 s to 25 s: Quartz fires the 10 s firing at 25 s. Its next fire time, 20 s, is past, and the last run
  ended 0 s ago, so it is skipped. The 20 s firing runs. Quartz itself skips only a firing over 15 minutes late
  (`misfireThreshold`). A firing late because Quartz had no free thread still runs: the last run ended an interval ago
  or more."
  [^JobExecutionContext ctx since-end-ms]
  (let [next-fire (some-> ctx .getNextFireTime .getTime)]
    (boolean (and next-fire
                  since-end-ms
                  (< next-fire (System/currentTimeMillis))
                  (< since-end-ms relay.cycle/interval-ms)))))

(task/defjob MonitorRelay
  "Runs one Metabase Monitor relay cycle, unless the last run on this node [[missed?]] the firing."
  {:saved-class "metabase_enterprise.monitor_relay.task.relay.MonitorRelay"
   :concurrent? false}
  [ctx]
  (when-not (missed? ctx (some-> @last-end u/since-ms))
    (try
      (relay.cycle/cycle!)
      (catch InterruptedException e
        (throw e))
      (catch Exception e
        (log/error e "A Metabase Monitor relay cycle failed. The relay goes on."))
      (finally
        (reset! last-end (u/start-timer))))))

(defmethod task/init! ::MonitorRelay [_]
  (if (= :h2 (relay.db/engine))
    (when-not (= :unset (:status (relay.config/target)))
      (log/info "The Metabase Monitor relay does nothing on an H2 application database"))
    (task/schedule-task!
     (jobs/build
      (jobs/with-description "Send this Metabase's activity to Metabase Monitor")
      (jobs/of-type MonitorRelay)
      (jobs/with-identity job-key)
      (jobs/store-durably))
     (triggers/build
      (triggers/with-identity trigger-key)
      (triggers/for-job job-key)
      (triggers/start-now)
      (triggers/with-schedule
       (simple/schedule
        (simple/with-interval-in-milliseconds relay.cycle/interval-ms)
        (simple/repeat-forever)
        (simple/with-misfire-handling-instruction-next-with-remaining-count)))))))
