(ns metabase-enterprise.monitor-relay.task.relay
  "The Metabase Monitor relay's Quartz job. While the relay has a URL, it runs one relay cycle every 10 s, on one node
  of the cluster at a time. The relay has no URL without the license's `:monitor-relay` feature. A node with the
  scheduler disabled never runs it. On an H2 app DB there is no job."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.settings :as relay.settings]
   [metabase.settings.core :as setting]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase-enterprise.monitor-relay.job"))

(def ^:private trigger-key (triggers/key "metabase-enterprise.monitor-relay.trigger"))

(task/defjob MonitorRelay
  "Runs one Metabase Monitor relay cycle, unless the trigger's next firing is due already. Then this firing is late,
  because a run took longer than the interval, and the next one runs instead. So the trigger never falls far behind:
  Quartz itself skips only a firing over 15 minutes late (`misfireThreshold`)."
  {:saved-class "metabase_enterprise.monitor_relay.task.relay.MonitorRelay"
   :concurrent? false}
  [ctx]
  (when-not (some-> ctx .getNextFireTime .getTime (< (System/currentTimeMillis)))
    (try
      (relay.cycle/cycle!)
      (catch InterruptedException e
        (throw e))
      (catch Exception e
        (log/error e "A Metabase Monitor relay cycle failed. The relay goes on.")))))

(defn schedule!
  "Schedules the relay's job while the relay has a well-formed URL, and deletes it otherwise. The job store is
  clustered, so this does it for every node. It runs at startup and when an admin saves the URL, so a license that
  gains `:monitor-relay` while the environment sets the URL starts the relay at the next startup. On an H2 app DB
  there is no job."
  []
  (let [status (:status (relay.settings/target))]
    (cond
      (= :h2 (relay.db/engine))
      (when-not (= :unset status)
        (log/info "The Metabase Monitor relay does nothing on an H2 application database"))

      (= :ok status)
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
          (simple/with-misfire-handling-instruction-next-with-remaining-count)))))

      :else
      (do (when (= :malformed status)
            (log/warnf "%s is not of the form <base>/ingest/<token>, so the Metabase Monitor relay sends nothing"
                       (setting/env-var-name :metabase-monitor-url)))
          (task/delete-task! job-key trigger-key)))))

(defmethod task/init! ::MonitorRelay [_]
  (schedule!))
