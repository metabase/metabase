(ns metabase-enterprise.library-branching.tasks-test-util
  "Helpers of the task tests. The task functions commit their rows, so a test of them runs with no other task test at
  the same time, and starts and ends with no task row and no base."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
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

(defn do-cancelling-at!
  "Calls `(f)`. When a progress report (`tasks/report-progress!`) writes the start of `phase`, a key of
  `tasks/phase-starts`, it cancels that task right after the write, as an admin who cancels at that moment. So the
  operation passes its report of `phase`, and its task is cancelled before its next step."
  [phase f]
  (let [original (dynamic-redefs/original-fn #'tasks/report-progress!)
        at       (tasks/phase-starts phase)]
    (dynamic-redefs/with-dynamic-fn-redefs
      [tasks/report-progress! (fn [id fraction]
                                (original id fraction)
                                (when (== at fraction)
                                  (tasks/cancel! id))
                                nil)]
      (f))))

(defmacro cancelling-at
  "Runs `body` with [[do-cancelling-at!]] of `phase`."
  [phase & body]
  `(do-cancelling-at! ~phase (fn [] ~@body)))
