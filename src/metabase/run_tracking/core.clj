(ns metabase.run-tracking.core
  "Shared primitives for run-tracking heartbeats and orphan reaping."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.task.core :as task]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)
   (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(defn cutoff
  "Honeysql form for `(now - age unit)` in the app-db dialect."
  [age unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit))

(defn unit->ms
  "Convert `age` of `unit` (`:second`, `:minute`, or `:hour`) to milliseconds."
  [age unit]
  (* age (case unit
           :second 1000
           :minute 60000
           :hour   3600000)))

(defn detection-latency-ms
  "Milliseconds elapsed past `(reference-ts + timeout-ms)` at `detected-at-ms` (epoch millis).
  Clamped at zero."
  [^OffsetDateTime reference-ts timeout-ms detected-at-ms]
  (max 0 (- detected-at-ms (inst-ms (.toInstant reference-ts)) timeout-ms)))

(defn heartbeat-ids!
  "Stamp `heartbeat-column = now` on the `active` rows of `model` in `ids`; no-op on empty `ids`."
  [model active heartbeat-column ids]
  (when (seq ids)
    (apply t2/update! model :id [:in ids] (concat active [{heartbeat-column :%now}]))))

(defn heartbeat-and-reconcile!
  "Per-node tick for the runs this process owns: call `(heartbeat! ids)`, then `(on-gone id)` for
  each id whose row no longer matches `active` (kv-pairs, e.g. `[:is_active true]`) — another path
  (reaper, force-cancel) terminated it, so the local work should stop. Only the `ids` snapshot is
  reconciled; runs registered mid-tick wait for the next one. No-op when `ids` is empty.

  `on-gone` runs on the shared heartbeat thread and must not block: a slow callback delays
  heartbeats for every run on this node, leaving them to be reaped as stale."
  [{:keys [model active ids heartbeat! on-gone]}]
  (when-let [ids (seq ids)]
    (heartbeat! ids)
    (let [active-ids (t2/select-fn-set :id model
                                       {:where (into [:and [:in :id ids]]
                                                     (map (fn [[k v]] [:= k v]))
                                                     (partition 2 active))})]
      (doseq [id ids
              :when (not (contains? active-ids id))]
        (on-gone id)))))

(defn reap-rows!
  "Atomically move the `:active` rows of `:model` matching the `:stale` honeysql predicate into
  `:terminal`, returning the pre-update rows. `SELECT … FOR UPDATE` + `UPDATE` in one transaction,
  so the returned rows are exactly those transitioned."
  [{:keys [model active stale terminal]}]
  (t2/with-transaction [_conn]
    (when-let [rows (not-empty (apply t2/select model (concat active [{:where stale :for :update}])))]
      (apply t2/update! model :id [:in (mapv :id rows)] (concat active [terminal]))
      rows)))

(defn reap-orphaned!
  "Like [[reap-rows!]] — reap the `:active` rows of `:model` matching the `:stale` predicate into
  `:terminal` — but also emit timeout analytics. Returns the reaped rows.

  `:metrics` (optional) holds the analytics inputs:
  - `:total-metric` (+ `:tags`) — counter incremented by the number of rows reaped.
  - `:latency-metric` (+ `:latency-column`, `:timeout-ms`) — per row, observes how long past
    `(row's :latency-column + :timeout-ms)` the reap was detected (see [[detection-latency-ms]])."
  [{:keys [model active terminal stale]
    {:keys [total-metric latency-metric tags latency-column timeout-ms]} :metrics}]
  (let [detected-at-ms (System/currentTimeMillis)
        reaped         (reap-rows! {:model model :active active :terminal terminal :stale stale})]
    (when (seq reaped)
      (when total-metric
        (analytics/inc! total-metric tags (count reaped)))
      (when latency-metric
        (doseq [row  reaped
                :let [ts (get row latency-column)]
                :when ts]
          (analytics/observe! latency-metric tags
                              (detection-latency-ms ts timeout-ms detected-at-ms)))))
    reaped))

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
       (Thread/sleep (long (unit->ms interval-minutes :minute)))
       (recur))
     (catch InterruptedException _ nil))))

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
