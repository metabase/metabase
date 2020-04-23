(ns metabase.task.task-history-cleanup-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.models
             [task-history :refer [TaskHistory]]
             [task-history-test :as tht]]
            [metabase.task.task-history-cleanup :as cleanup-task]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest cleanup-test
  (let [task-1   (tu/random-name)
        task-2   (tu/random-name)
        task-3   (tu/random-name)
        t1-start (t/offset-date-time)
        t2-start (tht/add-second t1-start)
        t3-start (tht/add-second t2-start)]
    (letfn [(do-with-tasks [{:keys [rows-to-keep]} thunk]
              (tt/with-temp* [TaskHistory [t1 (assoc (tht/make-10-millis-task t1-start)
                                                     :task task-1)]
                              TaskHistory [t2 (assoc (tht/make-10-millis-task t2-start)
                                                     :task task-2)]
                              TaskHistory [t3 (assoc (tht/make-10-millis-task t3-start)
                                                     :task task-3)]]
                (db/delete! TaskHistory :id [:not-in (map u/get-id [t1 t2 t3])])
                (with-redefs [cleanup-task/history-rows-to-keep rows-to-keep]
                  (#'cleanup-task/task-history-cleanup!))
                (thunk)))
            (task-history-tasks []
              (set (map :task (TaskHistory))))]
      (testing "Basic run of the cleanup task when it needs to remove rows. Should also add a TaskHistory row once complete"
        (do-with-tasks
         {:rows-to-keep 2}
         (fn []
           (is (= #{task-2 task-3 "task-history-cleanup"}
                  (task-history-tasks))))))
      (testing "When the task runs and nothing is removed, it should still insert a new TaskHistory row"
        (do-with-tasks
         {:rows-to-keep 10}
         (fn []
           (is (= #{task-1 task-2 task-3 "task-history-cleanup"}
                  (task-history-tasks)))))))))
