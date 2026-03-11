(ns metabase.task-history.task.task-run-heartbeat
  "Scheduled task to:
   1. Send heartbeat for running task runs owned by this process
   2. Mark orphaned task runs (no heartbeat for threshold hours) as :abandoned
   3. Mark orphaned tasks (in :started status with no heartbeat) as :unknown"
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.task.core :as task]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private orphan-threshold-hours
  "Runs with no heartbeat for this many hours are marked as orphaned."
  1)

(def ^:private max-run-duration-hours
  "Runs older than this many hours are marked as orphaned regardless of heartbeat."
  24)

(defn send-heartbeat!
  "Update updated_at for all :started runs belonging to this process."
  []
  (let [updated (t2/update! :model/TaskRun
                            {:status       :started
                             :process_uuid config/local-process-uuid}
                            {:updated_at (mi/now)})]
    (when (pos? updated)
      (log/debugf "Sent heartbeat for %d running task runs" updated))
    updated))

(defn mark-orphaned-runs!
  "Mark runs as :abandoned if:
   1. updated_at is older than threshold (no heartbeat), OR
   2. started_at is older than max run duration (stuck run)
   Returns the set of run IDs that were marked as orphaned."
  []
  (let [heartbeat-cutoff (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- orphan-threshold-hours) :hour)
        duration-cutoff  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- max-run-duration-hours) :hour)
        orphaned-run-ids (t2/select-fn-set :id :model/TaskRun
                                           {:where [:and
                                                    [:= :status "started"]
                                                    [:or
                                                     [:< :updated_at heartbeat-cutoff]
                                                     [:< :started_at duration-cutoff]]]})]
    (when (seq orphaned-run-ids)
      (t2/update! :model/TaskRun {:id [:in orphaned-run-ids]}
                  {:status   :abandoned
                   :ended_at (mi/now)})
      (log/infof "Marked %d abandoned task runs" (count orphaned-run-ids)))
    orphaned-run-ids))

(defn mark-orphaned-tasks!
  "Mark tasks as :unknown if they belong to the given orphaned runs."
  [orphaned-run-ids]
  (when (seq orphaned-run-ids)
    (let [orphaned (t2/update! :model/TaskHistory
                               {:status :started
                                :run_id [:in orphaned-run-ids]}
                               {:status   :unknown
                                :ended_at (mi/now)})]
      (when (pos? orphaned)
        (log/infof "Marked %d orphaned tasks as :unknown" orphaned))
      orphaned)))

(defn- task-run-heartbeat!
  "Send heartbeat for running tasks and mark orphaned runs/tasks."
  []
  (log/debug "Running task run heartbeat")
  (send-heartbeat!)
  (let [orphaned-run-ids (mark-orphaned-runs!)]
    (mark-orphaned-tasks! orphaned-run-ids)))

(task/defjob
  ^{:doc "Send heartbeat for running task runs and mark orphaned runs as :unknown"}
  TaskRunHeartbeat [_]
  (task-run-heartbeat!))

(def ^:private job-key     "metabase.task.task-run-heartbeat.job")
(def ^:private trigger-key "metabase.task.task-run-heartbeat.trigger")

(defmethod task/init! ::TaskRunHeartbeat [_]
  (let [job     (jobs/build
                 (jobs/of-type TaskRunHeartbeat)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run every 10 minutes
                  (cron/cron-schedule "0 */10 * * * ? *")))]
    (task/schedule-task! job trigger)))
