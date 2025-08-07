(ns metabase-enterprise.worker.sync
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.worker.api :as api]
   [metabase-enterprise.worker.models.worker-run :as worker-run]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent
    Executors
    ExecutorService
    Future
    ScheduledExecutorService
    TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase-enterprise.worker.sync")

(defn sync-single-run! [run-id]
  (try
    (let [resp (api/get-status run-id)]
      (case (:status resp)
        "started"
        :started
        "canceled"
        (do (worker-run/cancel-run! run-id {:end_time (t/instant (:end-time resp))
                                            :message (:note resp)})
            :canceled)
        "success"
        (do
          (worker-run/succeed-started-run! run-id {:end_time (t/instant (:end-time resp))})
          :success)
        "error"
        (do (worker-run/fail-started-run! run-id {:end_time (t/instant (:end-time resp))
                                                  :message (:note resp)})
            :error)
        "timeout"
        (do (worker-run/timeout-run! run-id {:end_time (t/instant (:end-time resp))
                                             :message (:note resp)})
            :timeout)))
    (catch Throwable t
      (log/error t (str "Error syncing " run-id)))))

(defn- sync-worker-runs! [_ctx]
  (log/trace "Syncing worker runs.")
  (let [runs (worker-run/reducible-active-remote-runs)]
    (run! (comp sync-single-run! :run_id) runs))

  (log/trace "Timing out old runs.")
  (worker-run/timeout-old-runs! 4 :hour)

  (log/trace "Canceling items that haven't been marked canceled.")
  (worker-run/cancel-old-canceling-runs! 1 :minute))

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
