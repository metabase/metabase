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

(defmulti post-success
  "What to run after successful remote run is synced locally. Dispatches on work_type."
  {:arglists '([run])}
  :work_type)

(defmethod post-success :default
  [_]
  #_do-nothing)

(defn- sync-worker-runs! [_ctx]
  (log/trace "Syncing worker runs.")
  (let [runs (worker-run/reducible-active-remote-runs)]
    (run! (fn [run]
            (try
              (let [resp (api/get-status (:run_id run))]
                (case (:status resp)
                  "started"
                  :do-nothing
                  "canceling"
                  (worker-run/mark-cancel-started-run! (:run_id run) {:end_time (t/instant (:end-time resp))
                                                                      :message (:note resp)})
                  "canceled"
                  (worker-run/cancel-run! (:run_id run) {:end_time (t/instant (:end-time resp))
                                                         :message (:note resp)})
                  "success"
                  (do
                    (worker-run/succeed-started-run! (:run_id run) {:end_time (t/instant (:end-time resp))})
                    (post-success run))
                  "error"
                  (worker-run/fail-started-run! (:run_id run) {:end_time (t/instant (:end-time resp))
                                                               :message (:note resp)})
                  "timeout"
                  (worker-run/timeout-run! (:run_id run) {:end_time (t/instant (:end-time resp))
                                                          :message (:note resp)})))
              (catch Throwable t
                (log/error t (str "Error syncing " (:run_id run))))))
          runs))

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
                     (calendar-interval/with-interval-in-seconds 2)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::SyncWorkerStatus [_]
  (when (api/run-remote?)
    (log/info "Scheduling worker sync.")
    (start-job!)))
