(ns metabase.models.task-history-test
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as time]]
            [expectations :refer :all]
            [metabase.models.task-history :refer :all]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn add-second
  "Adds one second to `t`"
  [t]
  (time/plus t (time/seconds 1)))

(defn add-10-millis
  "Adds 10 milliseconds to `t`"
  [t]
  (time/plus t (time/millis 10)))

(defn make-10-millis-task
  "Creates a map suitable for a `with-temp*` call for `TaskHistory`. Uses the `started_at` param sets the `ended_at`
  to 10 milliseconds later"
  [started-at]
  (let [ended-at (add-10-millis started-at)]
    {:started_at (du/->Timestamp started-at)
     :ended_at   (du/->Timestamp ended-at)
     :duration   (du/calculate-duration started-at ended-at)}))

;; Basic cleanup test where older rows are deleted and newer rows kept
(let [task-4 (tu/random-name)
      task-5 (tu/random-name)]
  (expect
    #{task-4 task-5}
    (let [t1-start (time/now)
          t2-start (add-second t1-start)
          t3-start (add-second t2-start)
          t4-start (add-second t3-start)
          t5-start (add-second t4-start)]
      (tt/with-temp* [TaskHistory [t1 (make-10-millis-task t1-start)]
                      TaskHistory [t2 (make-10-millis-task t2-start)]
                      TaskHistory [t3 (make-10-millis-task t3-start)]
                      TaskHistory [t4 (assoc (make-10-millis-task t4-start)
                                        :task task-4)]
                      TaskHistory [t5 (assoc (make-10-millis-task t5-start)
                                        :task task-5)]]
        ;; When the sync process runs, it creates several TaskHistory rows. We just want to work with the temp ones
        ;; created, so delete any stale ones from previous tests
        (db/delete! TaskHistory :id [:not-in (map u/get-id [t1 t2 t3 t4 t5])])
        ;; Delete all but 2 task history rows
        (cleanup-task-history! 2)
        (set (map :task (TaskHistory)))))))

;; Basic cleanup test where no work needs to be done and nothing is deleted
(let [task-1 (tu/random-name)
      task-2 (tu/random-name)]
  (expect
    [#{task-1 task-2}
     #{task-1 task-2}]
    (let [t1-start (time/now)
          t2-start (add-second t1-start)]
      (tt/with-temp* [TaskHistory [t1 (assoc (make-10-millis-task t1-start)
                                        :task task-1)]
                      TaskHistory [t2 (assoc (make-10-millis-task t2-start)
                                        :task task-2)]]
        ;; Cleanup any stale TalkHistory entries that are not the two being tested
        (db/delete! TaskHistory :id [:not-in (map u/get-id [t1 t2])])
        ;; We're keeping 100 rows, but there are only 2 present, so there should be no affect on running this
        [(set (map :task (TaskHistory)))
         (do
           (cleanup-task-history! 100)
           (set (map :task (TaskHistory))))]))))
