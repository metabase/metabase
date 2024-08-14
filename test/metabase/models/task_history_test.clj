(ns metabase.models.task-history-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models :refer [TaskHistory]]
   [metabase.models.task-history :as task-history]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn add-second
  "Adds one second to `t`"
  [t]
  (t/plus t (t/seconds 1)))

(defn add-10-millis
  "Adds 10 milliseconds to `t`"
  [t]
  (t/plus t (t/millis 10)))

(defn make-10-millis-task
  "Creates a map suitable for a `with-temp*` call for `TaskHistory`. Uses the `started_at` param sets the `ended_at`
  to 10 milliseconds later"
  [started-at]
  (let [ended-at (add-10-millis started-at)]
    {:started_at started-at
     :ended_at   ended-at
     :duration   (.between java.time.temporal.ChronoUnit/MILLIS started-at ended-at)}))

(deftest cleanup-test
  (testing "Basic cleanup test where older rows are deleted and newer rows kept"
    (let [task-4   (mt/random-name)
          task-5   (mt/random-name)
          t1-start (t/zoned-date-time)
          t2-start (add-second t1-start)
          t3-start (add-second t2-start)
          t4-start (add-second t3-start)
          t5-start (add-second t4-start)]
      (mt/with-temp [TaskHistory t1 (make-10-millis-task t1-start)
                     TaskHistory t2 (make-10-millis-task t2-start)
                     TaskHistory t3 (make-10-millis-task t3-start)
                     TaskHistory t4 (assoc (make-10-millis-task t4-start)
                                           :task task-4)
                     TaskHistory t5 (assoc (make-10-millis-task t5-start)
                                           :task task-5)]
        ;; When the sync process runs, it creates several TaskHistory rows. We just want to work with the
        ;; temp ones created, so delete any stale ones from previous tests
        (t2/delete! TaskHistory :id [:not-in (map u/the-id [t1 t2 t3 t4 t5])])
        ;; Delete all but 2 task history rows
        (task-history/cleanup-task-history! 2)
        (is (= #{task-4 task-5}
               (set (map :task (t2/select TaskHistory)))))))))

(deftest no-op-test
  (testing "Basic cleanup test where no work needs to be done and nothing is deleted"
    (let [task-1   (mt/random-name)
          task-2   (mt/random-name)
          t1-start (t/zoned-date-time)
          t2-start (add-second t1-start)]
      (mt/with-temp [TaskHistory t1 (assoc (make-10-millis-task t1-start)
                                           :task task-1)
                     TaskHistory t2 (assoc (make-10-millis-task t2-start)
                                           :task task-2)]
        ;; Cleanup any stale TalkHistory entries that are not the two being tested
        (t2/delete! TaskHistory :id [:not-in (map u/the-id [t1 t2])])
        ;; We're keeping 100 rows, but there are only 2 present, so there should be no affect on running this
        (is (= #{task-1 task-2}
               (set (map :task (t2/select TaskHistory)))))
        (task-history/cleanup-task-history! 100)
        (is (= #{task-1 task-2}
               (set (map :task (t2/select TaskHistory)))))))))

(deftest with-task-history-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "success path:"
      (let [task-name (mt/random-name)]
        (testing "task history is created before executing the body"
          (task-history/with-task-history {:task task-name}
            (is (=? {:status     :started
                     :started_at (mt/malli=? some?)
                     :ended_at   (mt/malli=? nil?)
                     :duration   (mt/malli=? nil?)}
                    (t2/select-one :model/TaskHistory :task task-name)))))
        (testing "when the task is done, updates status and duration correctly"
          (is (=? {:status     :success
                   :started_at (mt/malli=? some?)
                   :ended_at   (mt/malli=? some?)
                   :duration   (mt/malli=? nat-int?)}
                  (t2/select-one :model/TaskHistory :task task-name))))))
    (testing "failed path:"
      (let [task-name (mt/random-name)]
        (try
          (task-history/with-task-history {:task task-name}
            (throw (Exception. "test")))
          (catch Exception _e
            (testing "if a task throws an exception, updates its status and duration correctly"
              (is (=? {:status     :failed
                       :started_at (mt/malli=? some?)
                       :ended_at   (mt/malli=? some?)
                       :duration   (mt/malli=? nat-int?)}
                      (t2/select-one :model/TaskHistory :task task-name))))))))))
