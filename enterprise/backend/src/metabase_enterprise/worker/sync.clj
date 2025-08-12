(ns metabase-enterprise.worker.sync
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.worker.api :as api]
   [metabase-enterprise.worker.models.worker-run :as worker-run]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase-enterprise.worker.sync")

(defn sync-single-run!
  "Fetch status from worker and sync to mb db"
  [run-id]
  (let [resp (api/get-status run-id)]
    (case (:status resp)
      "running"
      :do-nothing
      "canceled"
      (worker-run/cancel-run! run-id {:end_time (t/instant (:end-time resp))
                                      :message (:note resp)})
      "success"
      (worker-run/succeed-started-run! run-id {:end_time (t/instant (:end-time resp))})
      "error"
      (worker-run/fail-started-run! run-id {:end_time (t/instant (:end-time resp))
                                            :message (:note resp)})
      "timeout"
      (worker-run/timeout-run! run-id {:end_time (t/instant (:end-time resp))
                                       :message (:note resp)}))
    resp))

(defn- wrap-log-errors [f msg]
  (fn [& args]
    (try
      (apply f args)
      (catch Throwable t
        (log/error t msg)
        nil))))

(defn- sync-worker-runs! [_ctx]
  (log/trace "Syncing worker runs.")
  (try
    (run! (wrap-log-errors (comp sync-single-run! :run_id) "Error syncing task")
          (worker-run/reducible-active-remote-runs))
    (catch Throwable t
      (log/error t "Error syncing worker runs.")))

  (log/trace "Timing out old runs.")
  (try
    (worker-run/timeout-old-runs! 4 :hour)
    (catch Throwable t
      (log/error t "Error timing out old runs.")))

  (log/trace "Canceling items that haven't been marked canceled.")
  (try
    (worker-run/cancel-old-canceling-runs! 1 :minute)
    (catch Throwable t
      (log/error t "Error canceling items not marked canceled."))))

(task/defjob  ^{:doc "Syncs remote execution information with local table."
                org.quartz.DisallowConcurrentExecution true}
  SyncWorkerStatus [ctx]
  (sync-worker-runs! ctx))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job (jobs/build
               (jobs/of-type SyncWorkerStatus)
               (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes 10)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::SyncWorkerStatus [_]
  (when (api/run-remote?)
    (log/info "Scheduling worker sync.")
    (start-job!)))
