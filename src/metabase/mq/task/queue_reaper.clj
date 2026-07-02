(ns metabase.mq.task.queue-reaper
  "Quartz job that periodically drops queue messages no node in the cluster has a listener for.

  With node-affinity ([[metabase.mq.quartz-affinity]]) a message for a queue this node can't handle is
  never acquired — it just waits in the shared store for a capable node. This reaper bounds that wait:
  a message no node has picked up for longer than `queue-no-listener-max-age-ms` (default 1 day) is
  dropped, so a message for a queue nobody handles (e.g. a new queue whose node was rolled back before
  anyone listened) doesn't linger forever.

  The reaper stays quiet for [[startup-grace-ms]] after the node comes up: after a cluster-wide outage
  a backlog of perfectly-deliverable messages will have piled up with old start times, and we must not
  drop them before the just-recovered cluster has had a chance to deliver them."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.quartz-affinity :as quartz-affinity]
   [metabase.mq.settings :as mq.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.lang.management ManagementFactory)
   (java.time Instant)
   (org.quartz JobExecutionContext Scheduler TriggerKey)))

(set! *warn-on-reflection* true)

(def ^:private startup-grace-ms
  "Don't drop any messages until the node has been up this long. After a cluster-wide outage, messages
  pile up with old start times; give the just-recovered cluster time to actually deliver them before
  reaping, so a long downtime doesn't cost us messages that a live cluster would happily deliver."
  (* 60 60 1000))

(defn- node-uptime-ms ^long []
  (.getUptime (ManagementFactory/getRuntimeMXBean)))

(defn- orphaned-trigger-rows
  "Queue message triggers in `sched-name`'s store that have sat `WAITING` — never acquired by any node —
  since before `threshold` (epoch ms). Returns rows of `{:trigger_name :job_name}`."
  [sched-name threshold]
  (t2/query {:select [:trigger_name :job_name]
             :from   [:qrtz_triggers]
             :where  [:and
                      [:= :sched_name sched-name]
                      [:= :trigger_group quartz-affinity/queue-job-group]
                      [:= :trigger_state "WAITING"]
                      [:< :start_time threshold]]}))

(defn- drop-orphaned-triggers!
  "Drops queue message triggers that have sat `WAITING` — never acquired by any node — for longer than
  [[mq.settings/queue-no-listener-max-age-ms]]. With node-affinity, a message for a queue no node in
  the cluster has a listener for is simply never acquired (it isn't bounced), so this is the mechanism
  that eventually gives up on it rather than letting it linger forever. A retried/requeued message
  gets a fresh trigger with a recent start time, so only genuinely-stuck messages age out. Returns the
  number dropped."
  [^Scheduler scheduler]
  (let [threshold (- (.toEpochMilli (Instant/now)) (mq.settings/queue-no-listener-max-age-ms))
        stuck     (orphaned-trigger-rows (.getSchedulerName scheduler) threshold)]
    (doseq [{:keys [trigger_name job_name]} stuck]
      ;; unscheduleJob removes the trigger (and its simple-trigger row); the durable job stays.
      (.unscheduleJob scheduler (TriggerKey. trigger_name quartz-affinity/queue-job-group))
      (log/warnf "Dropping queue message for %s: no node in the cluster has a listener after %d ms"
                 job_name (mq.settings/queue-no-listener-max-age-ms))
      (analytics/inc! :metabase-mq/batches-dropped {:channel job_name :reason "no-listener-expired"}))
    (count stuck)))

(def ^:private job-key (jobs/key "metabase.mq.task.queue-reaper.job"))
(def ^:private trigger-key (triggers/key "metabase.mq.task.queue-reaper.trigger"))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Drops queue messages no node in the cluster has a listener for (older than the max age)."}
  QueueReaper
  [ctx]
  (if (< (node-uptime-ms) startup-grace-ms)
    ;; too soon after startup — a recovering cluster may still be draining a backlog of old-but-valid
    ;; messages; don't drop anything yet.
    (log/debug "Queue reaper skipped: node has been up less than the startup grace period")
    (let [n (drop-orphaned-triggers! (.getScheduler ^JobExecutionContext ctx))]
      (when (pos? n)
        (log/infof "Dropped %d orphaned queue message(s) that no node has a listener for" n)))))

(defmethod task/init! ::QueueReaper [_]
  (let [job     (jobs/build
                 (jobs/of-type QueueReaper)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; every 15 minutes
                  (cron/cron-schedule "0 0/15 * * * ? *")))]
    (task/schedule-task! job trigger)))
