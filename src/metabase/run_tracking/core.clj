(ns metabase.run-tracking.core
  "Shared primitives for run-tracking heartbeats and orphan reaping."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Duration Instant OffsetDateTime)
   (java.time.temporal ChronoUnit)
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(defn cutoff
  "Honeysql form for `(now - age unit)` in the app-db dialect."
  [age unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit))

(defn unit->duration
  "Convert `age` of `unit` (`:second`, `:minute`, or `:hour`) to an exact `java.time.Duration`."
  ^Duration [age unit]
  (Duration/of age (case unit
                     :minute ChronoUnit/MINUTES
                     :second ChronoUnit/SECONDS
                     :hour   ChronoUnit/HOURS)))

(defn detection-latency-ms
  "Milliseconds elapsed past `(reference-ts + timeout-duration)` at the time of detection. Clamped at zero."
  [^OffsetDateTime reference-ts ^Duration timeout-duration ^Instant detected-at]
  (max 0 (.toMillis (.minus (Duration/between (.toInstant reference-ts) detected-at)
                            timeout-duration))))

(defn heartbeat-ids!
  "Stamp `heartbeat-column = now` on the `active` rows of `model` in `ids`; no-op on empty `ids`."
  [model active heartbeat-column ids]
  (when (seq ids)
    (apply t2/update! model :id [:in ids] (concat active [{heartbeat-column :%now}]))))

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
  `:terminal` — but also emit timeout analytics and run optional hooks. Returns the reaped rows.

  `:metrics` (optional) holds the analytics inputs:
  - `:total-metric` (+ `:tags`) — counter incremented by the number of rows reaped.
  - `:latency-metric` (+ `:latency-column`, `:timeout-duration`) — per row, observes how long past
    `(row's :latency-column + :timeout-duration)` the reap was detected (see [[detection-latency-ms]])."
  [{:keys [model active terminal stale]
    {:keys [total-metric latency-metric tags latency-column timeout-duration]} :metrics}]
  (let [detected-at (Instant/now)
        reaped      (reap-rows! {:model model :active active :terminal terminal :stale stale})]
    (when (seq reaped)
      (when total-metric
        (analytics/inc! total-metric tags (count reaped)))
      (when latency-metric
        (doseq [row  reaped
                :let [ts (get row latency-column)]
                :when ts]
          (analytics/observe! latency-metric tags
                              (detection-latency-ms ts timeout-duration detected-at)))))
    reaped))

(defn- daemon-scheduler
  ^ScheduledExecutorService [thread-name]
  (Executors/newSingleThreadScheduledExecutor
   (reify ThreadFactory
     (newThread [_ r]
       (doto (Thread. ^Runnable r ^String thread-name)
         (.setDaemon true))))))

(defn start-heartbeat!
  "Run `heartbeat-fn` every `interval-minutes` on a dedicated local daemon scheduler, starting immediately."
  ^ScheduledExecutorService [thread-name heartbeat-fn interval-minutes]
  (let [exec (daemon-scheduler thread-name)]
    (.scheduleAtFixedRate exec
                          (fn []
                            (try
                              (heartbeat-fn)
                              (catch Throwable t
                                (log/error t "Error sending run-tracking heartbeat"))))
                          0 (long interval-minutes) TimeUnit/MINUTES)
    exec))

(defn schedule-interval-job!
  "Schedule a clustered Quartz job of class `job-type` under `job-key`, firing every `interval-minutes`
  (misfires dropped). No-op if `job-key` already exists."
  [job-key job-type interval-minutes]
  (when-not (task/job-exists? job-key)
    (let [job     (jobs/build
                   (jobs/of-type job-type)
                   (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes interval-minutes)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmacro defrun-tracking-jobs
  "Define and schedule the heartbeat and orphan-reaper for a run model. The heartbeat runs per-node via
  [[start-heartbeat!]]; the reaper is a clustered Quartz job named `<base>Reaper`. `spec` keys:
  `:heartbeat-fn` (optional — omit when the model heartbeats itself from its own work loop, scheduling
  only the reaper), `:reap-fn` (returns the reaped rows), `:reaper-key`, and `:interval-minutes`
  (default 1)."
  [base {:keys [heartbeat-fn reap-fn reaper-key interval-minutes]
         :or   {interval-minutes 1}}]
  (let [reap-sym (vary-meta (symbol (str base "Reaper")) merge {'org.quartz.DisallowConcurrentExecution true})
        ns-str   (str (ns-name *ns*))
        hb-key   (keyword ns-str (str base "Heartbeat"))
        reap-key (keyword ns-str (str reap-sym))
        ;; "TransformJobRun" -> "transform job run", for the reaper's summary log line
        noun     (.replace ^String (u/->kebab-case-en (str base)) \- \space)]
    `(do
       ;; Heartbeat: per-node local scheduler
       ~@(when heartbeat-fn
           [`(defmethod task/init! ~hb-key [_#]
               (log/infof "Starting %s heartbeat (per-node)." ~(str base))
               (start-heartbeat! ~(str hb-key) ~heartbeat-fn ~interval-minutes))])
       ;; Reaper: single clustered Quartz job — global, idempotent sweep of orphaned runs.
       (task/defjob ~reap-sym [_ctx#]
         (when-let [reaped# (not-empty (~reap-fn))]
           (log/infof "Reaped %d orphaned %s(s) with stale heartbeats." (count reaped#) ~noun)))
       (defmethod task/init! ~reap-key [_#]
         (log/infof "Scheduling %s reaper task." ~(str base))
         (schedule-interval-job! ~reaper-key ~reap-sym ~interval-minutes)))))
