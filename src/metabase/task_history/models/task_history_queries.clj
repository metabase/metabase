(ns metabase.task-history.models.task-history-queries
  "HugSQL query fns for `:model/TaskHistory` (app-db HugSQL POC).

  The SQL lives in [[task_history.sql]] as literal text; the generated `*-sqlvec` fns only build
  `[sql & params]` vectors. Execution goes through Toucan 2 (`t2/select` / `t2/query` with the
  model), so instances, out-transforms, and hydration behave exactly as with HoneySQL queries."
  (:require
   [hugsql.core :as hugsql]
   [toucan2.tools.transformed :as t2.transformed]))

(declare cleanup-cutoff-sqlvec delete-ended-before-sqlvec list-tasks-sqlvec
         count-tasks-sqlvec unique-tasks-sqlvec
         insert-task-history-sqlvec update-task-history-sqlvec statuses-for-run-sqlvec
         tasks-for-run-sqlvec mark-orphaned-tasks-sqlvec)

(hugsql/def-sqlvec-fns "metabase/task_history/models/task_history.sql")

(defn in-xform
  "Apply `model`'s Toucan `:in` transforms to the matching non-nil keys of `m`, so values headed
  into raw SQL params take the same wire format a `t2` write would send (keywords -> strings,
  maps -> JSON). Reuses the registry `t2/deftransforms` writes to; nothing is duplicated."
  [model m]
  (reduce-kv (fn [m col {in-fn :in}]
               (if (some? (get m col))
                 (update m col in-fn)
                 m))
             m
             (t2.transformed/transforms model)))
