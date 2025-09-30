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
  (t2/delete! :model/RemoteSyncChangeLog)
  (f)
  (t2/delete! :model/RemoteSyncTask)
  (t2/delete! :model/RemoteSyncChangeLog))

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

;;; ------------------------------------------------------------------------------------------------
;;; Tests for trim-remote-sync-change-log!
;;; ------------------------------------------------------------------------------------------------

(deftest trim-remote-sync-change-log-deletes-old-records-test
  (testing "deletes remote_sync_change_log records older than 30 days"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        ;; Create change log entries at various ages relative to frozen time
        (let [now frozen-time]
          (mt/with-temp [:model/RemoteSyncChangeLog log-today {:sync_type "import"
                                                               :source_branch "main"
                                                               :target_branch "main"
                                                               :status "completed"
                                                               :model_type "Card"
                                                               :model_entity_id 1
                                                               :created_at now}
                         :model/RemoteSyncChangeLog log-15-days {:sync_type "export"
                                                                 :source_branch "main"
                                                                 :target_branch "main"
                                                                 :status "completed"
                                                                 :model_type "Dashboard"
                                                                 :model_entity_id 2
                                                                 :created_at (t/minus now (t/days 15))}
                         :model/RemoteSyncChangeLog log-29-days {:sync_type "import"
                                                                 :source_branch "main"
                                                                 :target_branch "main"
                                                                 :status "completed"
                                                                 :model_type "Card"
                                                                 :model_entity_id 3
                                                                 :created_at (t/minus now (t/days 29))}
                         :model/RemoteSyncChangeLog log-30-days {:sync_type "export"
                                                                 :source_branch "main"
                                                                 :target_branch "main"
                                                                 :status "completed"
                                                                 :model_type "Dashboard"
                                                                 :model_entity_id 4
                                                                 :created_at (t/minus now (t/days 30))}
                         :model/RemoteSyncChangeLog log-31-days {:sync_type "import"
                                                                 :source_branch "main"
                                                                 :target_branch "main"
                                                                 :status "failed"
                                                                 :model_type "Card"
                                                                 :model_entity_id 5
                                                                 :created_at (t/minus now (t/days 31))}
                         :model/RemoteSyncChangeLog log-60-days {:sync_type "export"
                                                                 :source_branch "main"
                                                                 :target_branch "main"
                                                                 :status "completed"
                                                                 :model_type "Collection"
                                                                 :model_entity_id 6
                                                                 :created_at (t/minus now (t/days 60))}]
            ;; Verify all logs were created
            (is (= 6 (t2/count :model/RemoteSyncChangeLog)))

            ;; Run cleanup
            (let [deleted-count (#'table-cleanup/trim-remote-sync-change-log!)]
              ;; Should delete logs at 31 and 60 days (2 logs)
              (is (= 2 deleted-count)))

            ;; Verify only recent logs remain
            (is (= 4 (t2/count :model/RemoteSyncChangeLog)))
            (is (some? (t2/select-one :model/RemoteSyncChangeLog :id (:id log-today))))
            (is (some? (t2/select-one :model/RemoteSyncChangeLog :id (:id log-15-days))))
            (is (some? (t2/select-one :model/RemoteSyncChangeLog :id (:id log-29-days))))
            (is (some? (t2/select-one :model/RemoteSyncChangeLog :id (:id log-30-days))))
            (is (nil? (t2/select-one :model/RemoteSyncChangeLog :id (:id log-31-days))))
            (is (nil? (t2/select-one :model/RemoteSyncChangeLog :id (:id log-60-days))))))))))

(deftest trim-remote-sync-change-log-handles-empty-table-test
  (testing "handles empty remote_sync_change_log table gracefully"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        (is (= 0 (t2/count :model/RemoteSyncChangeLog)))
        (let [deleted-count (#'table-cleanup/trim-remote-sync-change-log!)]
          (is (= 0 deleted-count))
          (is (= 0 (t2/count :model/RemoteSyncChangeLog))))))))

(deftest trim-remote-sync-change-log-handles-all-recent-data-test
  (testing "does not delete any records when all are within 30 days"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        (let [now frozen-time]
          (mt/with-temp [:model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 1
                                                       :created_at now}
                         :model/RemoteSyncChangeLog _ {:sync_type "export"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Dashboard"
                                                       :model_entity_id 2
                                                       :created_at (t/minus now (t/days 10))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "failed"
                                                       :model_type "Card"
                                                       :model_entity_id 3
                                                       :created_at (t/minus now (t/days 29))}]
            (is (= 3 (t2/count :model/RemoteSyncChangeLog)))

            ;; Run cleanup
            (let [deleted-count (#'table-cleanup/trim-remote-sync-change-log!)]
              (is (= 0 deleted-count)))

            ;; All logs should remain
            (is (= 3 (t2/count :model/RemoteSyncChangeLog)))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for full cleanup job
;;; ------------------------------------------------------------------------------------------------

(deftest full-cleanup-job-cleans-both-tables-test
  (testing "RemoteSyncTableCleanup job cleans up both tables"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        (let [now frozen-time
              old-date (t/minus now (t/days 35))]
          (mt/with-temp [:model/User user {:first_name "Test"
                                           :last_name "User"
                                           :email "test@example.com"}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at old-date
                                                  :ended_at old-date}
                         :model/RemoteSyncTask _ {:sync_task_type "export"
                                                  :initiated_by (:id user)
                                                  :started_at now
                                                  :ended_at now}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 1
                                                       :created_at old-date}
                         :model/RemoteSyncChangeLog _ {:sync_type "export"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Dashboard"
                                                       :model_entity_id 2
                                                       :created_at now}]
            ;; Verify data exists
            (is (= 2 (t2/count :model/RemoteSyncTask)))
            (is (= 2 (t2/count :model/RemoteSyncChangeLog)))

            ;; Run the job (calling the job function directly)
            (#'table-cleanup/trim-tables!)

            ;; Verify old records deleted, recent records remain
            (is (= 1 (t2/count :model/RemoteSyncTask)))
            (is (= 1 (t2/count :model/RemoteSyncChangeLog)))))))))

(deftest full-cleanup-job-handles-mixed-ages-test
  (testing "job correctly handles records of various ages"
    (let [frozen-time (t/offset-date-time 2025 9 30 14 0 0)]
      (t/with-clock (t/fixed-clock frozen-time)
        (let [now frozen-time]
          (mt/with-temp [:model/User user {:first_name "Test"
                                           :last_name "User"
                                           :email "test@example.com"}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 5))
                                                  :ended_at (t/minus now (t/days 5))}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 15))
                                                  :ended_at (t/minus now (t/days 15))}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 25))
                                                  :ended_at (t/minus now (t/days 25))}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 35))
                                                  :ended_at (t/minus now (t/days 35))}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 45))
                                                  :ended_at (t/minus now (t/days 45))}
                         :model/RemoteSyncTask _ {:sync_task_type "import"
                                                  :initiated_by (:id user)
                                                  :started_at (t/minus now (t/days 55))
                                                  :ended_at (t/minus now (t/days 55))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 5
                                                       :created_at (t/minus now (t/days 5))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 15
                                                       :created_at (t/minus now (t/days 15))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 25
                                                       :created_at (t/minus now (t/days 25))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 35
                                                       :created_at (t/minus now (t/days 35))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 45
                                                       :created_at (t/minus now (t/days 45))}
                         :model/RemoteSyncChangeLog _ {:sync_type "import"
                                                       :source_branch "main"
                                                       :target_branch "main"
                                                       :status "completed"
                                                       :model_type "Card"
                                                       :model_entity_id 55
                                                       :created_at (t/minus now (t/days 55))}]
            ;; Verify all created
            (is (= 6 (t2/count :model/RemoteSyncTask)))
            (is (= 6 (t2/count :model/RemoteSyncChangeLog)))

            ;; Run cleanup
            (#'table-cleanup/trim-tables!)

            ;; Should keep records from 5, 15, 25 days ago (3 each)
            ;; Should delete records from 35, 45, 55 days ago (3 each)
            (is (= 3 (t2/count :model/RemoteSyncTask)))
            (is (= 3 (t2/count :model/RemoteSyncChangeLog)))))))))
