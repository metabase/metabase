(ns metabase.transforms.canceling
  (:require
   [clojure.core.async :as a]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.events.core :as events]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-run-cancelation :as wr.cancelation]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)
   (java.util.concurrent Executors ScheduledExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.transforms.canceling")

(defonce ^:private ^ScheduledExecutorService scheduler
  (Executors/newScheduledThreadPool 1))

(defonce ^:private connections (atom {}))

(defn chan-start-run!
  "Registers cancel-chan for run-id"
  [run-id cancel-chan]
  (swap! connections assoc run-id cancel-chan)
  nil)

(defn chan-end-run!
  "Deregisters the cancel-chan for run-id and returns the channel"
  [run-id]
  (-> (swap-vals! connections dissoc run-id)
      first ;; old value
      (get run-id)))

(defn chan-signal-cancel!
  "Cancels the run for a given run-id"
  [run-id]
  (when-some [cancel-chan (chan-end-run! run-id)]
    (a/put! cancel-chan :cancel!)
    true))

(defn chan-start-timeout-vthread!
  "Starts a thread that will signal a timeout after a given number of minutes."
  [run-id timeout-minutes]
  (u.jvm/in-virtual-thread*
   (Thread/sleep (long (* timeout-minutes 60 1000))) ;; 4 hours
   (chan-signal-cancel! run-id)
   (transform-run/timeout-run! run-id)))

(defn- request-latency-ms
  "Milliseconds elapsed since `request-time`, or nil when `request-time` is nil.

  `request-time` is the `:time` column of `transform_run_cancelation`. Metabase's app-db JDBC layer (see
  `metabase.app-db.jdbc-protocols/read-column` for `Types/TIMESTAMP_WITH_TIMEZONE` and the mysql `Types/TIMESTAMP`
  branch) normalizes that column to `java.time.OffsetDateTime` on every supported app DB."
  [request-time]
  (when request-time
    (u/since-ms-wall-clock (.toEpochMilli (.toInstant ^OffsetDateTime request-time)))))

(defn- record-completion!
  "Emit metrics + audit event for a cancelation completion. `outcome` ∈ #{\"success\" \"timeout\" \"error\"}.
  `run` is the pre-fetched `:model/TransformRun` row (or nil); when nil the audit event is skipped, metrics still
  emit. The caller owns the fetch so we don't redundantly refetch a row it already has."
  [run-id run request-time outcome]
  (prometheus/inc! :metabase-transforms/cancelation-completed {:outcome outcome})
  (when-let [latency (request-latency-ms request-time)]
    (prometheus/observe! :metabase-transforms/cancelation-latency-ms
                         {:outcome outcome} latency))
  (try
    (when run
      (events/publish-event! :event/transform-run-canceled
                             {:object  run
                              :details {:outcome outcome}}))
    (catch Throwable t
      (log/warnf t "Failed to publish transform-run-canceled event for run %s (outcome=%s)"
                 run-id outcome))))

(defn cancel-run!
  "Cancel a `run` (a `:model/TransformRun` row). `request-time` is the `java.time.OffsetDateTime` of the cancelation
  request — the background loop passes the `:time` from the cancelation row; the API path passes
  `(OffsetDateTime/now)` since it just inserted the row microseconds earlier.

  Callers own the fetching of `run` since the full row is needed for instrumentation & audit logging of this
  operation which changes state."
  [run request-time]
  (let [run-id (:id run)]
    (tracing/with-span :tasks "task.transform.cancel" {:run/id       run-id
                                                       :transform/id (:transform_id run)}
      (try
        (when (chan-signal-cancel! run-id)
          (let [result (transform-run/cancel-run! run-id)]
            (log/infof "Canceled transform run %s" run-id)
            (record-completion! run-id run request-time "success")
            result))
        (catch Throwable t
          (record-completion! run-id run request-time "error")
          (throw t))))))

(defn- cancel-old-transform-runs! [_ctx]
  ;; Preselect the rows we're about to force-cancel so we can emit per-row observability.
  ;; Small race vs. the bulk update below: a run that completes cleanly between the select and update will
  ;; be double-counted as a timeout. Acceptable for directional metrics.
  (let [stale (try (wr.cancelation/stale-canceling-cancelations 2 :minute)
                   (catch Throwable t
                     (log/error t "Error selecting stale transform run cancelations.")
                     []))]
    (when (seq stale)
      (log/infof "Force-canceling %d transform run(s) that have been canceling for more than 2 minutes."
                 (count stale))
      ;; If the bulk update throws, report each preselected row as `error` so operators see the failure
      ;; in metrics rather than only in logs.
      (let [outcome (try
                      (transform-run/cancel-old-canceling-runs! 2 :minute)
                      "timeout"
                      (catch Throwable t
                        (log/error t "Error force-canceling stale transform runs.")
                        "error"))]
        (doseq [{run-id :run_id request-time :time} stale]
          (try
            (let [run (t2/select-one :model/TransformRun :id run-id)]
              (record-completion! run-id run request-time outcome))
            (catch Throwable t
              (log/error t (str "Error recording completion for transform run " run-id)))))))))

(task/defjob  ^{:doc "Cancel items that haven't been canceled in two minutes"
                org.quartz.DisallowConcurrentExecution true}
  CancelOldTransformRuns [ctx]
  (cancel-old-transform-runs! ctx))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job (jobs/build
               (jobs/of-type CancelOldTransformRuns)
               (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes 10)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::CancelOldTransformRuns [_]
  (log/info "Scheduling cancel transforms task.")
  (start-job!))

(defmethod task/init! ::CancelRuns [_]
  (log/info "Scheduling the cancelation background task.")
  ;; does not use the Quartz scheduler
  (.scheduleAtFixedRate scheduler
                        #(try
                           (run! (fn [cancelation]
                                   (let [id (:run_id cancelation)
                                         request-time (:time cancelation)]
                                     (try
                                       ;; Skip silently if the run was deleted between cancelation insert and now
                                       ;; — `chan-signal-cancel!` would be a no-op anyway in that case.
                                       (when-let [run (t2/select-one :model/TransformRun :id id)]
                                         (cancel-run! run request-time))
                                       (catch Throwable t
                                         (log/error t (str "Error canceling " id))))))
                                 (wr.cancelation/reducible-canceled-local-runs))
                           (catch Throwable t
                             (log/error t "Error while canceling a transform run."))) 0 20 TimeUnit/SECONDS))
