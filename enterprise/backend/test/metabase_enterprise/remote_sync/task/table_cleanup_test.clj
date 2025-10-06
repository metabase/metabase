(ns metabase-enterprise.remote-sync.task.table-cleanup-test
  "Tests for remote sync table cleanup tasks."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.task.table-cleanup :as table-cleanup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- cleanup-tables
  "Clean up remote sync tables for testing."
  [f]
  (t2/delete! :model/RemoteSyncTask)
  (f)
  (t2/delete! :model/RemoteSyncTask))

(use-fixtures :each cleanup-tables)

;;; ------------------------------------------------------------------------------------------------
;;; Tests for trim-remote-sync-tasks!
;;; ------------------------------------------------------------------------------------------------

(deftest trim-remote-sync-tasks-deletes-old-records-test
  (testing "deletes remote_sync_task records older than 30 days"
    ;; Freeze time to a specific moment
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        ;; Create tasks at various ages relative to frozen time
        (let [now frozen-time]
          (mt/with-temp [:model/User user {:first_name "Test"
                                           :last_name "User"
                                           :email "test@example.com"}
                         :model/RemoteSyncTask task-today {:sync_task_type "import"
                                                           :initiated_by (:id user)
                                                           :started_at now
                                                           :ended_at now}
                         :model/RemoteSyncTask task-15-days {:sync_task_type "import"
                                                             :initiated_by (:id user)
                                                             :started_at (t/minus now (t/days 15))
                                                             :ended_at (t/minus now (t/days 15))}
                         :model/RemoteSyncTask task-29-days {:sync_task_type "import"
                                                             :initiated_by (:id user)
                                                             :started_at (t/minus now (t/days 29))
                                                             :ended_at (t/minus now (t/days 29))}
                         :model/RemoteSyncTask task-30-days {:sync_task_type "export"
                                                             :initiated_by (:id user)
                                                             :started_at (t/minus now (t/days 30))
                                                             :ended_at (t/minus now (t/days 30))}
                         :model/RemoteSyncTask task-31-days {:sync_task_type "import"
                                                             :initiated_by (:id user)
                                                             :started_at (t/minus now (t/days 31))
                                                             :ended_at (t/minus now (t/days 31))}
                         :model/RemoteSyncTask task-60-days {:sync_task_type "export"
                                                             :initiated_by (:id user)
                                                             :started_at (t/minus now (t/days 60))
                                                             :ended_at (t/minus now (t/days 60))}]
            ;; Verify all tasks were created
            (is (= 6 (t2/count :model/RemoteSyncTask)))

            ;; Run cleanup
            (let [deleted-count (#'table-cleanup/trim-remote-sync-tasks!)]
              ;; Should delete tasks at 31 and 60 days (2 tasks)
              (is (= 2 deleted-count)))

            ;; Verify only recent tasks remain
            (is (= 4 (t2/count :model/RemoteSyncTask)))
            (is (some? (t2/select-one :model/RemoteSyncTask :id (:id task-today))))
            (is (some? (t2/select-one :model/RemoteSyncTask :id (:id task-15-days))))
            (is (some? (t2/select-one :model/RemoteSyncTask :id (:id task-29-days))))
            (is (some? (t2/select-one :model/RemoteSyncTask :id (:id task-30-days))))
            (is (nil? (t2/select-one :model/RemoteSyncTask :id (:id task-31-days))))
            (is (nil? (t2/select-one :model/RemoteSyncTask :id (:id task-60-days))))))))))

(deftest trim-remote-sync-tasks-handles-empty-table-test
  (testing "handles empty remote_sync_task table gracefully"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        (is (= 0 (t2/count :model/RemoteSyncTask)))
        (let [deleted-count (#'table-cleanup/trim-remote-sync-tasks!)]
          (is (= 0 deleted-count))
          (is (= 0 (t2/count :model/RemoteSyncTask))))))))

(deftest trim-remote-sync-tasks-handles-all-recent-data-test
  (testing "does not delete any records when all are within 30 days"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        (let [now frozen-time]
          (mt/with-temp [:model/User user {:first_name "Test"
                                           :last_name "User"
                                           :email "test@example.com"}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at now
                                                  :ended_at now}
                         :model/RemoteSyncTask _ {:sync_task_type "export"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 10))
                                                  :ended_at (t/minus now (t/days 10))}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 29))
                                                  :ended_at (t/minus now (t/days 29))}]
            (is (= 3 (t2/count :model/RemoteSyncTask)))

            ;; Run cleanup
            (let [deleted-count (#'table-cleanup/trim-remote-sync-tasks!)]
              (is (= 0 deleted-count)))

            ;; All tasks should remain
            (is (= 3 (t2/count :model/RemoteSyncTask)))))))))
