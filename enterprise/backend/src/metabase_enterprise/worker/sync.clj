(ns  metabase-enterprise.worker.sync
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.worker.api :as api]
   [metabase-enterprise.worker.models.worker-run]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase-enterprise.worker.sync")

(defmulti post-success
  "What to run after successful remote run is synced locally. Dispatches on work_type."
  {:arglists '([run])}
  :work_type)

(defmethod post-success :default
  [_]
  #_do-nothing)

(comment

  (t2/hydrate (t2/select-one :model/Transform 1) :worker-runs)

  (reduce conj
          []
          (t2/reducible-select :model/WorkerRun :is_local false :is_active true))

  (t2/select :model/WorkerRun))

(defn- sync-worker-runs! [_ctx]
  (log/trace "Syncing worker runs.")
  (let [runs (t2/reducible-select :model/WorkerRun :is_local false :is_active true)]
    (reduce (fn [_ run]
              (try
                (let [resp (api/get-status (:run_id run))]
                  (case (:status resp)
                    "success"
                    (do
                      (t2/update! :model/WorkerRun
                                  :run_id (:run_id run)
                                  {:status :exec-succeeded
                                   :end_time (t/instant (:end-time resp))
                                   :is_active nil})
                      (post-success run))
                    "error"
                    (t2/update! :model/WorkerRun
                                :run_id (:run_id run)
                                {:status :exec-failed
                                 :end_time (t/instant (:end-time resp))
                                 :is_active nil
                                 :message (:note resp)})
                    "timeout"
                    (t2/update! :model/WorkerRun
                                :run_id (:run_id run)
                                {:status :timeout
                                 :end_time (t/instant (:end-time resp))
                                 :is_active nil
                                 :message (:note resp)})))
                (catch Throwable t
                  (log/error t (str "Error syncing " (:run_id run))))))
            nil runs))
  (log/trace "Timing out old runs.")
  (t2/update! :model/WorkerRun
              :is_active true
              [:< :start_time
               (sql.qp/add-interval-honeysql-form (mdb/db-type) [:now] -1 :minute)] true
              {:status :timeout
               :end_time [:now]
               :is_active nil
               :message "Timed out by metabase"}))

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
