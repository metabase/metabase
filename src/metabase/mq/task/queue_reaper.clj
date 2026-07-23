(ns metabase.mq.task.queue-reaper
  "Quartz job that periodically drops queue messages no node in the cluster has a listener for.

  With node-affinity ([[metabase.mq.quartz-affinity]]) a message for a queue this node can't handle is
  never acquired — it just waits in the shared store for a capable node. This reaper bounds that wait:
  a message no node has picked up for longer than `queue-no-listener-max-age-ms` (default 1 day) is
  dropped, so a message for a queue nobody handles (e.g. a new queue whose node was rolled back before
  anyone listened) doesn't linger forever.

  Age is the only signal we have: Quartz's cluster state records live *nodes* but not which queues each
  node has a listener for (node-affinity is a runtime acquisition filter, never persisted), and the
  durable per-queue job is created by the publisher, not the listener — so there is no cluster-wide way
  to tell 'a listener exists for this queue' apart from 'this trigger has sat unacquired for a long
  time'. A queue with a live but heavily backlogged listener (e.g. `:exclusive`) can therefore be
  reaped if it stays unacquired past the max age; the generous default (1 day) plus [[startup-grace-ms]]
  keep that from happening in normal operation.

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
  since before `threshold` (epoch ms). Returns rows of `{:trigger_name :job_name}`.

  The table is referenced as the unquoted, upper-case `QRTZ_TRIGGERS` on purpose: Metabase creates the
  Quartz tables upper-case on MySQL/MariaDB (where table names are case-sensitive on Linux) but
  lower-case on Postgres. An unquoted upper-case identifier resolves on every backend — Postgres folds
  it to lower-case, MySQL/H2 match the stored upper-case name — whereas Toucan's default *quoted
  lower-case* reference (`:qrtz_triggers`) fails on case-sensitive MySQL/MariaDB. (Quartz's own SQL
  references these tables the same unquoted upper-case way.)"
  [sched-name threshold]
  (t2/query [(str "SELECT trigger_name, job_name FROM QRTZ_TRIGGERS"
                  " WHERE sched_name = ? AND trigger_group = ? AND trigger_state = 'WAITING'"
                  " AND start_time < ?")
             sched-name quartz-affinity/queue-job-group threshold]))

(defn- drop-orphaned-triggers!
  "Drops queue message triggers that have sat `WAITING` — never acquired by any node — for longer than
  [[mq.settings/queue-no-listener-max-age-ms]]. With node-affinity, a message for a queue no node
  handles is never acquired (it isn't bounced), so this is the mechanism that eventually gives up on it
  rather than letting it linger forever. A retried/requeued message gets a fresh trigger with a recent
  start time, so only genuinely-stuck messages age out.

  Returns the number dropped."
  [^Scheduler scheduler]
  (let [sched-name (.getSchedulerName scheduler)
        max-age    (mq.settings/queue-no-listener-max-age-ms)
        threshold  (- (.toEpochMilli (Instant/now)) max-age)
        rows       (orphaned-trigger-rows sched-name threshold)]
    (doseq [{:keys [trigger_name job_name]} rows]
      ;; unscheduleJob removes the trigger (and its simple-trigger row); the durable job stays.
      (.unscheduleJob scheduler (TriggerKey. trigger_name quartz-affinity/queue-job-group))
      (log/warnf "Dropping queue message for %s: no node in the cluster has a listener after %d ms"
                 job_name max-age)
      (analytics/inc! :metabase-mq/batches-dropped {:channel job_name :reason "no-listener-expired"}))
    (count rows)))

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
