(ns  metabase-enterprise.worker.sync
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.worker.api :as api]
   [metabase-enterprise.worker.models.worker-run]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase-enterprise.worker.sync")

(defmulti post-success
  "What to run after successful remote run is synced locally. Dispatches on work_type."
  {:arglists '([run])}
  :run_id)

(defmethod post-success :default
  [_]
  #_do-nothing)

(defn- sync-worker-runs! [_ctx]
  (log/trace "Syncing worker runs.")
  (let [runs (t2/reducible-select :model/WorkerRun :is_local false :status :started)]
    (reduce (fn [_ run]
              (try
                (let [resp (api/get-status (:run_id run))]
                  (case (:status resp)
                    "success"
                    (do
                      (t2/update! :model/WorkerRun (:run_id run)
                                  {:status :exec-succeeded
                                   :end_time (:end-time resp)})
                      (post-success run))
                    "error"
                    (t2/update! :model/WorkerRun (:run_id run)
                                {:status :exec-failed
                                 :end_time (:end-time resp)
                                 :message (:note resp)})))
                (catch Throwable t
                  (log/error t (str "Error syncing " (:run_id run))))))
            nil runs)))

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
