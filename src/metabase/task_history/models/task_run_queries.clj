(ns metabase.task-history.models.task-run-queries
  "Query executors for `:model/TaskRun`, built on [[metabase.app-db.hugsql]]. SQL lives in
  task_run.sql as private sqlvec builders; executors apply the model's `:in`/`:out` transforms and
  never expose a queryable to callers."
  (:require
   [hugsql.core :as hugsql]
   [metabase.app-db.hugsql :as app-db.hugsql]))

(set! *warn-on-reflection* true)

(def ^:private model :model/TaskRun)

(declare insert-task-run-sqlvec complete-task-run-sqlvec task-run-by-id-sqlvec
         send-heartbeat-sqlvec distinct-run-entities-sqlvec)

(hugsql/def-sqlvec-fns "metabase/task_history/models/task_run.sql")

(def distinct-run-entities
  "Distinct {:entity_type :entity_id} rows for a run type in a [started_from, started_to) window."
  (app-db.hugsql/select-executor model distinct-run-entities-sqlvec))

(defn task-run
  "The task_run row for `id` as a model instance, or nil."
  [id]
  (first ((app-db.hugsql/select-executor model task-run-by-id-sqlvec) {:id id})))

(defn insert-task-run!
  "Insert one task_run `row`, returning the generated id."
  [row]
  (app-db.hugsql/insert-returning-pk! model insert-task-run-sqlvec
                                      (merge {:notification_id nil} row)))

(defn complete-task-run!
  "Set a still-`started` run's status/ended_at. Returns the updated-row count."
  [row]
  (app-db.hugsql/execute! model complete-task-run-sqlvec row))

(defn send-heartbeat!
  "Stamp updated_at on this process's still-`started` runs. Returns the updated-row count."
  [now process-uuid]
  (app-db.hugsql/execute! model send-heartbeat-sqlvec {:now now, :process_uuid process-uuid}))
