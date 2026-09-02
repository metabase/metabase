(ns metabase.task-history.models.task-history-queries
  "Query executors for `:model/TaskHistory`, built on [[metabase.app-db.hugsql]].

  The SQL lives in task_history.sql as private sqlvec *builders* (`-- :name-`, suffixed `-sqlvec`
  so they never collide with the public executors here); each executor wraps a builder to apply
  the model's declared `:in`/`:out` transforms and never exposes a queryable to callers. Reads
  return Toucan instances, so `t2/hydrate` and out-transforms behave as with a HoneySQL query."
  (:require
   [hugsql.core :as hugsql]
   [metabase.app-db.hugsql :as app-db.hugsql]))

(set! *warn-on-reflection* true)

(def ^:private model :model/TaskHistory)

;; Private sqlvec builders (`<name>-sqlvec`), one per `-- :name-` in task_history.sql. The declare
;; doubles as the file's table of contents (clj-kondo can't see vars interned by def-sqlvec-fns).
(declare cleanup-cutoff-sqlvec delete-ended-before-sqlvec list-tasks-sqlvec count-tasks-sqlvec
         unique-tasks-sqlvec insert-task-history-sqlvec update-task-history-sqlvec
         task-history-by-id-sqlvec task-counts-for-runs-sqlvec statuses-for-run-sqlvec
         tasks-for-run-sqlvec mark-orphaned-tasks-sqlvec)

(hugsql/def-sqlvec-fns "metabase/task_history/models/task_history.sql")

;;; Public executors: params in, rows/instances or a count out. Callers never touch a queryable.

(def list-tasks
  "Paged task listing: `params -> [instance]`. Params: `:task` `:status` (filters), `:sort-col`
  `:sort-dir` `:limit` `:offset`."
  (app-db.hugsql/select-executor model list-tasks-sqlvec))

(def unique-tasks
  "Distinct task names in alphabetical order: `_ -> [instance]` (each row has `:task`)."
  (app-db.hugsql/select-executor model unique-tasks-sqlvec))

(def statuses-for-run
  "Task rows for a run id: `{:run-id id} -> [instance]` (each has `:status`)."
  (app-db.hugsql/select-executor model statuses-for-run-sqlvec))

(def tasks-for-run
  "All task rows for a run id, oldest first: `{:run-id id} -> [instance]`."
  (app-db.hugsql/select-executor model tasks-for-run-sqlvec))

(defn task-history
  "The task_history row for `id` as a model instance, or nil."
  [id]
  (first ((app-db.hugsql/select-executor model task-history-by-id-sqlvec) {:id id})))

(defn cleanup-cutoff-ended-at
  "The `ended_at` of the newest row past the first `keep` rows, or nil."
  [keep]
  (:ended_at (app-db.hugsql/scalar model cleanup-cutoff-sqlvec {:keep keep})))

(defn delete-ended-before!
  "Delete rows with `ended_at <= cutoff`. Returns the deleted-row count."
  [cutoff]
  (app-db.hugsql/execute! model delete-ended-before-sqlvec {:cutoff cutoff}))

(defn count-tasks
  "Count rows matching the optional `:task`/`:status` filters."
  [params]
  (:cnt (app-db.hugsql/scalar model count-tasks-sqlvec params)))

(defn task-counts-for-runs
  "Per-run {:run_id :task_count :success_count :failed_count} for non-empty `run-ids` (plain rows)."
  [run-ids]
  (when (seq run-ids)
    (app-db.hugsql/rows model task-counts-for-runs-sqlvec {:run-ids run-ids})))

(defn insert-task-history!
  "Insert one task_history `row`, returning the generated id."
  [row]
  (app-db.hugsql/insert-returning-pk! model insert-task-history-sqlvec
                                      (merge {:db_id nil, :task_details nil, :run_id nil} row)))

(defn update-task-history!
  "Update one task_history row by `:id` with the given (full) column map."
  [row]
  (app-db.hugsql/execute! model update-task-history-sqlvec (merge {:task_details nil, :logs nil} row)))

(defn mark-orphaned-tasks!
  "Mark still-`started` tasks belonging to `run-ids` as `unknown`, stamping `ended_at = now`.
  No-op (returns 0) when `run-ids` is empty -- an empty IN list is a SQL error."
  [now run-ids]
  (if (seq run-ids)
    (app-db.hugsql/execute! model mark-orphaned-tasks-sqlvec {:now now, :run-ids run-ids})
    0))
