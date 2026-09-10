(ns metabase.task-history.task.task-run-heartbeat
  "Scheduled task to:
   1. Send heartbeat for running task runs owned by this process
   2. Mark orphaned task runs (no heartbeat for threshold hours) as :abandoned
   3. Mark orphaned tasks (in :started status with no heartbeat) as :unknown"
  (:require
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.run-tracking.core :as rt]
   [metabase.task-history.db :as task-history.db]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]))

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
  (tracing/with-span :tasks "task.heartbeat.update" {}
    (let [updated (task-history.db/heartbeat-started-task-runs! config/local-process-uuid (mi/now))]
      (when (pos? updated)
        (log/debugf "Sent heartbeat for %d running task runs" updated))
      updated)))

(defn mark-orphaned-runs!
  "Mark runs as :abandoned if:
   1. updated_at is older than threshold (no heartbeat), OR
   2. started_at is older than max run duration (stuck run)
   Returns the set of run IDs that were marked as orphaned."
  []
  (let [orphaned (tracing/with-span :tasks "task.heartbeat.mark-orphaned-runs" {}
                   (rt/reap-rows! {:model    :model/TaskRun
                                   :active   [:= :status "started"]
                                   :terminal {:status "abandoned" :ended_at (mi/now)}
                                   :stale    [:or
                                              [:< :updated_at (rt/cutoff orphan-threshold-hours :hour)]
                                              [:< :started_at (rt/cutoff max-run-duration-hours :hour)]]}))]
    (into #{} (map :id) orphaned)))

(defn mark-orphaned-tasks!
  "Mark tasks as :unknown if they belong to the given orphaned runs."
  [orphaned-run-ids]
  (when (seq orphaned-run-ids)
    (tracing/with-span :tasks "task.heartbeat.mark-orphaned-tasks" {:heartbeat/orphaned-run-count (count orphaned-run-ids)}
      (let [orphaned (task-history.db/mark-started-tasks-unknown! orphaned-run-ids (mi/now))]
        (when (pos? orphaned)
          (log/infof "Marked %d orphaned tasks as :unknown" orphaned))
        orphaned))))

(defn- reap-orphans!
  "Mark orphaned task runs as :abandoned and their tasks as :unknown; return the reaped run ids."
  []
  (let [orphaned-run-ids (mark-orphaned-runs!)]
    (mark-orphaned-tasks! orphaned-run-ids)
    orphaned-run-ids))

(defmethod task/init! ::TaskRunHeartbeat [_]
  (rt/start-heartbeat! send-heartbeat! 10))

(defmethod task/init! ::TaskRunReaper [_]
  (rt/schedule-reaper! {:job-key          "metabase.task.task-run-reaper.job"
                        :label            "task run"
                        :reap-fn          reap-orphans!
                        :interval-minutes 10}))
