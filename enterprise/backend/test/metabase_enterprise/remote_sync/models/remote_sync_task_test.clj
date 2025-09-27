(ns metabase-enterprise.remote-sync.models.remote-sync-task-test
  "Unit tests for the remote-sync-task model."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
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

(deftest create-sync-task-with-required-fields-test
  (testing "creates a sync task with required fields"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (is (some? task))
        (is (= "import" (:sync_task_type task)))
        (is (= (:id user) (:initiated_by task)))
        (is (some? (:started_at task)))
        (is (nil? (:ended_at task)))
        (is (= 0.0 (:progress task)))
        (is (nil? (:error_message task)))
        (rst/complete-sync-task! (:id task))))))

(deftest create-sync-task-with-additional-fields-test
  (testing "creates a sync task with additional fields"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "export" (:id user) {:progress 0.5})]
        (is (= "export" (:sync_task_type task)))
        (is (= 0.5 (:progress task)))
        (rst/complete-sync-task! (:id task))))))

(deftest create-sync-task-validates-type-enum-test
  (testing "validates sync task type enum"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (is (thrown-with-msg?
           Exception
           #"Invalid input"
           (rst/create-sync-task! "invalid-type" (:id user)))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for update-progress!
;;; ------------------------------------------------------------------------------------------------

(deftest update-progress-value-test
  (testing "updates progress value"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/update-progress! (:id task) 0.25)
        (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 0.25 (:progress updated-task)))
          (is (some? (:last_progress_report_at updated-task))))
        (rst/complete-sync-task! (:id task))))))

(deftest update-progress-multiple-times-test
  (testing "updates progress multiple times"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/update-progress! (:id task) 0.5)
        (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 0.5 (:progress updated-task))))

        (rst/update-progress! (:id task) 0.75)
        (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 0.75 (:progress updated-task))))
        (rst/complete-sync-task! (:id task))))))

(deftest update-progress-edge-case-values-test
  (testing "handles edge case progress values"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/update-progress! (:id task) 0.0)
        (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 0.0 (:progress updated-task))))

        (rst/update-progress! (:id task) 1.0)
        (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 1.0 (:progress updated-task))))
        (rst/complete-sync-task! (:id task))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for complete-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest complete-sync-task-marks-task-as-completed-test
  (testing "marks task as completed"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/complete-sync-task! (:id task))
        (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 1.0 (:progress completed-task)))
          (is (some? (:ended_at completed-task)))
          (is (nil? (:error_message completed-task))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for fail-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest fail-sync-task-with-error-message-test
  (testing "marks task as failed with error message"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "export" (:id user))
            error-msg "Connection timeout: Failed to connect to remote server"]
        (rst/fail-sync-task! (:id task) error-msg)
        (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (some? (:ended_at failed-task)))
          (is (= error-msg (:error_message failed-task)))
          ;; Progress remains unchanged when task fails
          (is (= 0.0 (:progress failed-task))))))))

(deftest fail-sync-task-with-progress-test
  (testing "can fail a task that had progress"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/update-progress! (:id task) 0.5)
        (rst/fail-sync-task! (:id task) "Partial failure after 50% complete")
        (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (= 0.5 (:progress failed-task)))
          (is (= "Partial failure after 50% complete" (:error_message failed-task)))
          (is (some? (:ended_at failed-task))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for current-task-by-type
;;; ------------------------------------------------------------------------------------------------

(deftest current-task-returns-nil-when-no-active-tasks-test
  (testing "returns nil when no active tasks exist"
    (is (nil? (first (rst/current-task))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for Hydration
;;; ------------------------------------------------------------------------------------------------

(deftest hydration-of-initiated-by-user-test
  (testing "hydrates user information"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            hydrated-task (t2/hydrate task :initiated_by_user)]
        (is (some? (:initiated_by_user hydrated-task)))
        (is (= (:id user) (get-in hydrated-task [:initiated_by_user :id])))
        (is (= "Test" (get-in hydrated-task [:initiated_by_user :first_name])))
        (is (= "User" (get-in hydrated-task [:initiated_by_user :last_name])))
        (is (= "test@example.com" (get-in hydrated-task [:initiated_by_user :email])))
        (rst/complete-sync-task! (:id task))))))

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
      (rst/complete-sync-task! (:id task)))))

(deftest hydration-handles-nil-user-gracefully-test
  (testing "hydration handles nil user gracefully"
    (let [task (t2/insert-returning-instance! :model/RemoteSyncTask
                                              {:sync_task_type "import"
                                               :initiated_by nil
                                               :started_at (mi/now)})
          hydrated-task (t2/hydrate task :initiated_by_user)]
      (is (nil? (:initiated_by_user hydrated-task)))
      (rst/complete-sync-task! (:id task)))))

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

(deftest tasks-cannot-run-concurrently-test
  (testing "concurrent tasks"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (is (thrown-with-msg? Exception #"A running task exists" (rst/create-sync-task! "import" (:id user))))
        (rst/complete-sync-task! (:id task))))))

 ;;; ------------------------------------------------------------------------------------------------
;;; Tests for successful?, failed?, and timed-out?
;;; ------------------------------------------------------------------------------------------------

(deftest successful?-test
  (testing "successful? returns true for completed task without error"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/complete-sync-task! (:id task))
        (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (true? (rst/successful? completed-task)))))))

  (testing "successful? returns false for incomplete task"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/successful? running-task)))
        (rst/complete-sync-task! (:id task)))))

  (testing "successful? returns false for failed task"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/fail-sync-task! (:id task) "error")
        (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (false? (rst/successful? failed-task))))))))

(deftest failed?-test
  (testing "failed? returns true for task with error and ended_at"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/fail-sync-task! (:id task) "Connection failed")
        (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (true? (rst/failed? failed-task)))))))

  (testing "failed? returns false for incomplete task"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/failed? running-task)))
        (rst/complete-sync-task! (:id task)))))

  (testing "failed? returns false for successful task"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (rst/complete-sync-task! (:id task))
        (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (false? (rst/failed? completed-task))))))))

(deftest timed-out?-returns-true-for-stale-task-test
  (testing "timed-out? returns true for incomplete task with old last_progress_report_at"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            old-time (t/minus (t/offset-date-time) (t/hours 2))]
        (try
          (t2/update! :model/RemoteSyncTask (:id task)
                      {:last_progress_report_at old-time})
          (let [stale-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (true? (rst/timed-out? stale-task))))
          (finally
            (rst/complete-sync-task! (:id task))))))))

(deftest timed-out?-returns-false-for-active-task-test
  (testing "timed-out? returns false for incomplete task with recent last_progress_report_at"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))]
        (try
          (rst/update-progress! (:id task) 0.5)
          (let [active-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (false? (rst/timed-out? active-task))))
          (finally
            (rst/complete-sync-task! (:id task))))))))

(deftest timed-out?-returns-false-for-completed-task-test
  (testing "timed-out? returns false for completed task even with old last_progress_report_at"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            old-time (t/minus (t/offset-date-time) (t/hours 2))]
        (t2/update! :model/RemoteSyncTask (:id task)
                    {:last_progress_report_at old-time})
        (rst/complete-sync-task! (:id task))
        (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (false? (rst/timed-out? completed-task))))))))

(deftest timed-out?-returns-false-for-failed-task-test
  (testing "timed-out? returns false for failed task even with old last_progress_report_at"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            old-time (t/minus (t/offset-date-time) (t/hours 2))]
        (t2/update! :model/RemoteSyncTask (:id task)
                    {:last_progress_report_at old-time})
        (rst/fail-sync-task! (:id task) "Task failed")
        (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (false? (rst/timed-out? failed-task))))))))

(deftest timed-out?-returns-false-at-boundary-test
  (testing "timed-out? returns false at time limit boundary"
    (mt/with-temp [:model/User user {:first_name "Test"
                                     :last_name "User"
                                     :email "test@example.com"}]
      (let [task (rst/create-sync-task! "import" (:id user))
            boundary-time (t/minus (t/offset-date-time) (t/minutes 59))]
        (try
          (t2/update! :model/RemoteSyncTask (:id task)
                      {:last_progress_report_at boundary-time})
          (let [boundary-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
            (is (false? (rst/timed-out? boundary-task))))
          (finally
            (rst/complete-sync-task! (:id task))))))))
