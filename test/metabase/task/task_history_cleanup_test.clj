(ns metabase.task.task-history-cleanup-test
  (:require [clj-time.core :as time]
            [expectations :refer :all]
            [metabase.models
             [task-history :refer [TaskHistory]]
             [task-history-test :as tht]]
            [metabase.task.task-history-cleanup :as cleanup-task]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; Basic run of the cleanup task when it needs to remove rows. Should also add a TaskHistory row once complete
(let [task-2 (tu/random-name)
      task-3 (tu/random-name)]
  (expect
    #{task-2 task-3 (var-get #'cleanup-task/job-name)}
    (let [t1-start (time/now)
          t2-start (tht/add-second t1-start)
          t3-start (tht/add-second t2-start)]
      (tt/with-temp* [TaskHistory [t1 (tht/make-10-millis-task t1-start)]
                      TaskHistory [t2 (assoc (tht/make-10-millis-task t2-start)
                                        :task task-2)]
                      TaskHistory [t3 (assoc (tht/make-10-millis-task t3-start)
                                        :task task-3)]]
        (with-redefs [cleanup-task/history-rows-to-keep 2]
          (db/delete! TaskHistory :id [:not-in (map u/get-id [t1 t2 t3])])
          ;; Delete all but 2 task history rows
          (#'cleanup-task/task-history-cleanup!)
          (set (map :task (TaskHistory))))))))

;; When the task runs and nothing is removed, it should still insert a new TaskHistory row
(let [task-1 (tu/random-name)
      task-2 (tu/random-name)
      task-3 (tu/random-name)]
  (expect
    #{task-1 task-2 task-3 (var-get #'cleanup-task/job-name)}
    (let [t1-start (time/now)
          t2-start (tht/add-second t1-start)
          t3-start (tht/add-second t2-start)]
      (tt/with-temp* [TaskHistory [t1 (assoc (tht/make-10-millis-task t1-start)
                                        :task task-1)]
                      TaskHistory [t2 (assoc (tht/make-10-millis-task t2-start)
                                        :task task-2)]
                      TaskHistory [t3 (assoc (tht/make-10-millis-task t3-start)
                                        :task task-3)]]
        (with-redefs [cleanup-task/history-rows-to-keep 10]
          (db/delete! TaskHistory :id [:not-in (map u/get-id [t1 t2 t3])])
          ;; Delete all but 2 task history rows
          (#'cleanup-task/task-history-cleanup!)
          (set (map :task (TaskHistory))))))))
