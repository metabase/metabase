(ns metabase-enterprise.remote-sync.models.remote-sync-task-test
  "Unit tests for the remote-sync-task model."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as rst]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------------------------------------------------------
;;; Helper Functions
;;; ------------------------------------------------------------------------------------------------

(defn- cleanup-sync-tasks
  "Clean up all remote sync tasks for testing."
  [f]
  (t2/delete! :model/RemoteSyncTask)
  (f)
  (t2/delete! :model/RemoteSyncTask))

(use-fixtures :each cleanup-sync-tasks)

;;; ------------------------------------------------------------------------------------------------
;;; Tests for create-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest create-sync-task!-test
  (testing "create-sync-task! basic functionality"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (testing "creates a sync task with required fields"
        (let [task (rst/create-sync-task! "import" (:id user))]
          (is (some? task))
          (is (= "import" (:sync_task_type task)))
          (is (= (:id user) (:initiated_by task)))
          (is (some? (:started_at task)))
          (is (nil? (:ended_at task)))
          (is (= 0.0 (:progress task)))
          (is (nil? (:error_message task)))))

      (testing "creates a sync task with additional fields"
        (let [task (rst/create-sync-task! "export" (:id user) {:progress 0.5})]
          (is (= "export" (:sync_task_type task)))
          (is (= 0.5 (:progress task)))))

      (testing "validates sync task type enum"
        (is (thrown-with-msg?
             Exception
             #"Invalid input"
             (rst/create-sync-task! "invalid-type" (:id user))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for update-progress!
;;; ------------------------------------------------------------------------------------------------

(deftest update-progress!-test
  (testing "update-progress! functionality"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (testing "updates progress value"
          (rst/update-progress! (:id task) 0.25)
          (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 0.25 (:progress updated-task)))
            (is (some? (:last_progress_report_at updated-task)))))

        (testing "updates progress multiple times"
          (rst/update-progress! (:id task) 0.5)
          (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 0.5 (:progress updated-task))))

          (rst/update-progress! (:id task) 0.75)
          (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 0.75 (:progress updated-task)))))

        (testing "handles edge case progress values"
          (rst/update-progress! (:id task) 0.0)
          (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 0.0 (:progress updated-task))))

          (rst/update-progress! (:id task) 1.0)
          (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 1.0 (:progress updated-task)))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for complete-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest complete-sync-task!-test
  (testing "complete-sync-task! functionality"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (testing "marks task as completed"
          (rst/complete-sync-task! (:id task))
          (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 1.0 (:progress completed-task)))
            (is (some? (:ended_at completed-task)))
            (is (nil? (:error_message completed-task)))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for fail-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest fail-sync-task!-test
  (testing "fail-sync-task! functionality"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "export" (:id user))]
        (testing "marks task as failed with error message"
          (let [error-msg "Connection timeout: Failed to connect to remote server"]
            (rst/fail-sync-task! (:id task) error-msg)
            (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
              (is (some? (:ended_at failed-task)))
              (is (= error-msg (:error_message failed-task)))
              ;; Progress remains unchanged when task fails
              (is (= 0.0 (:progress failed-task))))))

        (testing "can fail a task that had progress"
          (let [task2 (rst/create-sync-task! "import" (:id user))]
            (rst/update-progress! (:id task2) 0.5)
            (rst/fail-sync-task! (:id task2) "Partial failure after 50% complete")
            (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task2))]
              (is (= 0.5 (:progress failed-task)))
              (is (= "Partial failure after 50% complete" (:error_message failed-task)))
              (is (some? (:ended_at failed-task))))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for current-task-by-type
;;; ------------------------------------------------------------------------------------------------

(deftest current-task-by-type-test
  (testing "current-task-by-type functionality"
    (mt/with-temp [:model/User user1 {:first_name "Test1"
                                      :last_name "User"
                                      :email "test1@example.com"}
                   :model/User user2 {:first_name "Test2"
                                      :last_name "User"
                                      :email "test2@example.com"}]
      (testing "returns nil when no active tasks exist"
        (is (nil? (first (rst/current-task-by-type "import"))))
        (is (nil? (first (rst/current-task-by-type "export")))))

      (testing "returns the most recent active task of the specified type"
        ;; Create completed task (should not be returned)
        (let [completed-task (rst/create-sync-task! "import" (:id user1))]
          (rst/complete-sync-task! (:id completed-task)))

        ;; Create failed task (should not be returned)
        (let [failed-task (rst/create-sync-task! "import" (:id user1))]
          (rst/fail-sync-task! (:id failed-task) "Test failure"))

        (let [active-import (rst/create-sync-task! "import" (:id user1))]
          ;; Create active export task
          (let [active-export (rst/create-sync-task! "export" (:id user2))]

            (testing "returns correct task by type"
              (let [current-import (first (rst/current-task-by-type "import"))]
                (is (some? current-import))
                (is (= (:id active-import) (:id current-import)))
                (is (= "import" (:sync_task_type current-import))))

              (let [current-export (first (rst/current-task-by-type "export"))]
                (is (some? current-export))
                (is (= (:id active-export) (:id current-export)))
                (is (= "export" (:sync_task_type current-export))))))

        ;; Create another more recent import task
          (let [newer-import (rst/create-sync-task! "import" (:id user2))]
            (testing "returns the most recent task when multiple active tasks exist"
              (let [current-import (first (rst/current-task-by-type "import"))]
                (is (= (:id newer-import) (:id current-import))))))))))

  (testing "validates sync task type enum"
    (is (thrown-with-msg?
         Exception
         #"Invalid input"
         (rst/current-task-by-type "invalid-type")))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for Hydration
;;; ------------------------------------------------------------------------------------------------

(deftest hydration-test
  (testing "hydration of initiated_by_user"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            hydrated-task (t2/hydrate task :initiated_by_user)]
        (testing "hydrates user information"
          (is (some? (:initiated_by_user hydrated-task)))
          (is (= (:id user) (get-in hydrated-task [:initiated_by_user :id])))
          (is (= "Test" (get-in hydrated-task [:initiated_by_user :first_name])))
          (is (= "User" (get-in hydrated-task [:initiated_by_user :last_name])))
          (is (= "test@example.com" (get-in hydrated-task [:initiated_by_user :email]))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for Edge Cases and Error Handling
;;; ------------------------------------------------------------------------------------------------

(deftest handles-tasks-with-no-initiating-user-test
  (testing "handles tasks with no initiating user"
    (let [task (t2/insert-returning-instance! :model/RemoteSyncTask
                                              {:sync_task_type "import"
                                               :initiated_by nil
                                               :started_at (mi/now)})]
      (is (some? task))
      (is (nil? (:initiated_by task)))

      (testing "hydration handles nil user gracefully"
        (let [hydrated-task (t2/hydrate task :initiated_by_user)]
          (is (nil? (:initiated_by_user hydrated-task))))))))

(deftest multiple-tasks-can-exist-simultaneously-test
  (testing "multiple tasks can exist simultaneously"
    (mt/with-temp [:model/User user1 {:first_name "User1"
                                      :last_name "Test"
                                      :email "user1@example.com"}
                   :model/User user2 {:first_name "User2"
                                      :last_name "Test"
                                      :email "user2@example.com"}]
      (let [task1 (rst/create-sync-task! "import" (:id user1))
            task2 (rst/create-sync-task! "export" (:id user2))
            task3 (rst/create-sync-task! "import" (:id user2))]
        (is (= 3 (t2/count :model/RemoteSyncTask)))
        ;; Each task should have unique ID
        (is (not= (:id task1) (:id task2)))
        (is (not= (:id task2) (:id task3)))
        (is (not= (:id task1) (:id task3)))))))

(deftest task-lifecycle-creation-to-completion-test
  (testing "task lifecycle - from creation to completion"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        ;; Initial state
        (is (= 0.0 (:progress task)))
        (is (nil? (:ended_at task)))
        (is (some? (:started_at task)))

        ;; Progress updates
        (rst/update-progress! (:id task) 0.3)
        (let [updated (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 0.3 (:progress updated)))
          (is (nil? (:ended_at updated))))

        ;; Completion
        (rst/complete-sync-task! (:id task))
        (let [completed (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 1.0 (:progress completed)))
          (is (some? (:ended_at completed)))
          (is (nil? (:error_message completed))))))))

(deftest task-lifecycle-creation-to-failure-test
  (testing "task lifecycle - from creation to failure"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "export" (:id user))]
        ;; Progress before failure
        (rst/update-progress! (:id task) 0.7)

        ;; Failure
        (let [error-msg "Network connection lost"]
          (rst/fail-sync-task! (:id task) error-msg)
          (let [failed (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (= 0.7 (:progress failed))) ; Progress preserved
            (is (some? (:ended_at failed)))
            (is (= error-msg (:error_message failed)))))))))

(deftest concurrent-tasks-of-same-type-test
  (testing "concurrent tasks of same type"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      ;; Create multiple active import tasks
      (let [_task1 (rst/create-sync-task! "import" (:id user))]
        (Thread/sleep 10)
        (let [_task2 (rst/create-sync-task! "import" (:id user))]
          (Thread/sleep 10)
          (let [task3 (rst/create-sync-task! "import" (:id user))
                ;; current-task-by-type should return the most recent
                current (first (rst/current-task-by-type "import"))]
            (is (= (:id task3) (:id current)))))))))
