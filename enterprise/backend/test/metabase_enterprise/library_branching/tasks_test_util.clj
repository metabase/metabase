(ns metabase-enterprise.library-branching.tasks-test-util
  "Helpers of the task tests. The task functions commit their rows, so a test of them runs with no other task test at
  the same time, and starts and ends with no task row and no base."
  (:require
   [java-time.api :as t]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn clear!
  "Deletes every task row, and clears the base."
  []
  (t2/query {:delete-from :library_branching_task})
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn do-with-no-tasks!
  "Calls `f` with no task row and no base, and clears both again afterwards."
  [f]
  (clear!)
  (try
    (f)
    (finally
      (clear!))))

(defmacro with-no-tasks
  "Runs `body` with no task row and no base, and clears both again afterwards."
  [& body]
  `(do-with-no-tasks! (fn [] ~@body)))

(defn pause!
  "Makes the heartbeat of task `id` two hours old, as when its worker paused for that time."
  [id]
  (t2/query {:update :library_branching_task
             :set    {:last_heartbeat_at (t/minus (t/offset-date-time) (t/hours 2))}
             :where  [:= :id id]}))

(defn row-status
  "The status of task row `id`."
  [id]
  (:status (t2/query-one {:select [:status] :from [:library_branching_task] :where [:= :id id]})))
