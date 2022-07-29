(ns metabase.models.task-history-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.analytics.snowplow-test :as snowplow-test]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.models :refer [Database TaskHistory]]
            [metabase.models.task-history :as task-history]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

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
      (mt/with-temp* [TaskHistory [t1 (make-10-millis-task t1-start)]
                      TaskHistory [t2 (make-10-millis-task t2-start)]
                      TaskHistory [t3 (make-10-millis-task t3-start)]
                      TaskHistory [t4 (assoc (make-10-millis-task t4-start)
                                             :task task-4)]
                      TaskHistory [t5 (assoc (make-10-millis-task t5-start)
                                             :task task-5)]]
        ;; When the sync process runs, it creates several TaskHistory rows. We just want to work with the
        ;; temp ones created, so delete any stale ones from previous tests
        (db/delete! TaskHistory :id [:not-in (map u/the-id [t1 t2 t3 t4 t5])])
        ;; Delete all but 2 task history rows
        (task-history/cleanup-task-history! 2)
        (is (= #{task-4 task-5}
               (set (map :task (TaskHistory)))))))))

(deftest no-op-test
  (testing "Basic cleanup test where no work needs to be done and nothing is deleted"
    (let [task-1   (mt/random-name)
          task-2   (mt/random-name)
          t1-start (t/zoned-date-time)
          t2-start (add-second t1-start)]
      (mt/with-temp* [TaskHistory [t1 (assoc (make-10-millis-task t1-start)
                                             :task task-1)]
                      TaskHistory [t2 (assoc (make-10-millis-task t2-start)
                                             :task task-2)]]
        ;; Cleanup any stale TalkHistory entries that are not the two being tested
        (db/delete! TaskHistory :id [:not-in (map u/the-id [t1 t2])])
        ;; We're keeping 100 rows, but there are only 2 present, so there should be no affect on running this
        (is (= #{task-1 task-2}
               (set (map :task (TaskHistory)))))
        (task-history/cleanup-task-history! 100)
        (is (= #{task-1 task-2}
               (set (map :task (TaskHistory)))))))))

(defn- insert-then-pop!
  "Insert a task history and get the last snowplow event."
  [task]
  (db/insert! TaskHistory task)
  (-> (snowplow-test/pop-event-data-and-user-id!)
      last
      mt/boolean-ids-and-timestamps
      (update-in [:data "task_details"] json/parse-string)))

(deftest snowplow-tracking-test
  (snowplow-test/with-fake-snowplow-collector
    (let [t (t/zoned-date-time)]
      (testing "inserting a task history should track a snowplow event"
        (is (= {:data   {"duration"     10
                         "ended_at"     true
                         "started_at"   true
                         "event"        "new_task_history"
                         "task_details" {"apple" 40, "orange" 2}
                         "task_id"      true
                         "task_name"   "a fake task"}
                :user-id nil}
               (insert-then-pop! (assoc (make-10-millis-task t)
                                        :task         "a fake task"
                                        :task_details {:apple  40
                                                       :orange 2}))))

        (testing "should have user id if *current-user-id* is bound"
          (binding [*current-user-id* 1]
            (is (= {:data    {"duration"     10
                              "ended_at"     true
                              "started_at"   true
                              "event"        "new_task_history"
                              "task_details" {"apple" 40, "orange" 2}
                              "task_id"      true
                              "task_name"   "a fake task"}
                    :user-id "1"}
                   (insert-then-pop! (assoc (make-10-millis-task t)
                                            :task         "a fake task"
                                            :task_details {:apple  40
                                                           :orange 2}))))))

        (testing "infer db_engine if db_id exists"
          (mt/with-temp Database [{db-id :id} {:engine "postgres"}]
            (is (= {:data    {"duration"     10
                              "ended_at"     true
                              "started_at"   true
                              "db_id"        true
                              "db_engine"    "postgres"
                              "event"        "new_task_history"
                              "task_details" {"apple" 40, "orange" 2}
                              "task_id"      true
                              "task_name"   "a fake task"}
                    :user-id nil}
                   (insert-then-pop! (assoc (make-10-millis-task t)
                                            :task         "a fake task"
                                            :db_id        db-id
                                            :task_details {:apple  40
                                                           :orange 2}))))))
        (testing "date-time properties should be correctly formatted"
          (db/insert! TaskHistory (assoc (make-10-millis-task t) :task "a fake task"))
          (let [event (:data (first (snowplow-test/pop-event-data-and-user-id!)))]
            (is (snowplow-test/valid-datetime-for-snowplow? (get event "started_at")))
            (is (snowplow-test/valid-datetime-for-snowplow? (get event "ended_at")))))))))
