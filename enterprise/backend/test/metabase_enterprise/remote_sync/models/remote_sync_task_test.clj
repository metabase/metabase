(ns metabase-enterprise.remote-sync.models.remote-sync-task-test
  "Unit tests for the remote-sync-task model."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as rst]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each th/clean-remote-sync-state)

;;; ------------------------------------------------------------------------------------------------
;;; Tests for create-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest create-sync-task-with-required-fields-test
  (testing "creates a sync task with required fields"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (is (some? task))
      (is (= "import" (:sync_task_type task)))
      (is (= (mt/user->id :rasta) (:initiated_by task)))
      (is (some? (:started_at task)))
      (is (nil? (:ended_at task)))
      (is (= 0.0 (:progress task)))
      (is (nil? (:error_message task)))
      (rst/complete-sync-task! (:id task)))))

(deftest create-sync-task-with-additional-fields-test
  (testing "creates a sync task with additional fields"
    (let [task (rst/create-sync-task! "export" (mt/user->id :rasta) {:progress 0.5})]
      (is (= "export" (:sync_task_type task)))
      (is (= 0.5 (:progress task)))
      (rst/complete-sync-task! (:id task)))))

(deftest create-sync-task-validates-type-enum-test
  (testing "validates sync task type enum"
    (is (thrown-with-msg?
         Exception
         #"Invalid input"
         (rst/create-sync-task! "invalid-type" (mt/user->id :rasta))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for update-progress!
;;; ------------------------------------------------------------------------------------------------

(deftest update-progress-value-test
  (testing "updates progress value"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/update-progress! (:id task) 0.25)
      (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 0.25 (:progress updated-task)))
        (is (some? (:last_progress_report_at updated-task))))
      (rst/complete-sync-task! (:id task)))))

(deftest update-progress-multiple-times-test
  (testing "updates progress multiple times"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/update-progress! (:id task) 0.5)
      (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 0.5 (:progress updated-task))))

      (rst/update-progress! (:id task) 0.75)
      (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 0.75 (:progress updated-task))))
      (rst/complete-sync-task! (:id task)))))

(deftest update-progress-edge-case-values-test
  (testing "handles edge case progress values"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/update-progress! (:id task) 0.0)
      (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 0.0 (:progress updated-task))))

      (rst/update-progress! (:id task) 1.0)
      (let [updated-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 1.0 (:progress updated-task))))
      (rst/complete-sync-task! (:id task)))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for complete-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest complete-sync-task-marks-task-as-completed-test
  (testing "marks task as completed"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/complete-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 1.0 (:progress completed-task)))
        (is (some? (:ended_at completed-task)))
        (is (nil? (:error_message completed-task)))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for fail-sync-task!
;;; ------------------------------------------------------------------------------------------------

(deftest fail-sync-task-with-error-message-test
  (testing "marks task as failed with error message"
    (let [task (rst/create-sync-task! "export" (mt/user->id :rasta))
          error-msg "Connection timeout: Failed to connect to remote server"]
      (rst/fail-sync-task! (:id task) error-msg)
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (some? (:ended_at failed-task)))
        (is (= error-msg (:error_message failed-task)))
        ;; Progress remains unchanged when task fails
        (is (= 0.0 (:progress failed-task)))))))

(deftest fail-sync-task-with-progress-test
  (testing "can fail a task that had progress"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/update-progress! (:id task) 0.5)
      (rst/fail-sync-task! (:id task) "Partial failure after 50% complete")
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 0.5 (:progress failed-task)))
        (is (= "Partial failure after 50% complete" (:error_message failed-task)))
        (is (some? (:ended_at failed-task)))))))

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
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          hydrated-task (t2/hydrate task :initiated_by_user)]
      (is (some? (:initiated_by_user hydrated-task)))
      (is (= (mt/user->id :rasta) (get-in hydrated-task [:initiated_by_user :id])))
      (is (= "Rasta" (get-in hydrated-task [:initiated_by_user :first_name])))
      (is (= "Toucan" (get-in hydrated-task [:initiated_by_user :last_name])))
      (is (= "rasta@metabase.com" (get-in hydrated-task [:initiated_by_user :email])))
      (rst/complete-sync-task! (:id task)))))

(deftest hydration-of-status-test
  (testing "hydrates status"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          hydrated-task (t2/hydrate task :status)]
      (is (= :running (:status hydrated-task))))))

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
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      ;; Initial state
      (is (= 0.0 (:progress task)))
      (is (nil? (:ended_at task)))
      (is (some? (:started_at task)))

      ;; Progress updates
      (rst/update-progress! (:id task) 0.3)
      (let [updated (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (< (abs (- 0.3 (:progress updated))) 0.0001))
        (is (nil? (:ended_at updated))))

      ;; Completion
      (rst/complete-sync-task! (:id task))
      (let [completed (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (= 1.0 (:progress completed)))
        (is (some? (:ended_at completed)))
        (is (nil? (:error_message completed)))))))

(deftest task-lifecycle-creation-to-failure-test
  (testing "task lifecycle - from creation to failure"
    (let [task (rst/create-sync-task! "export" (mt/user->id :rasta))]
      ;; Progress before failure
      (rst/update-progress! (:id task) 0.7)

      ;; Failure
      (let [error-msg "Network connection lost"]
        (rst/fail-sync-task! (:id task) error-msg)
        (let [failed (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (< (abs (- 0.7 (:progress failed))) 0.0001))
          (is (some? (:ended_at failed)))
          (is (= error-msg (:error_message failed))))))))

(deftest tasks-cannot-run-concurrently-test
  (testing "concurrent tasks"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (is (thrown-with-msg? Exception #"A running task exists" (rst/create-sync-task! "import" (mt/user->id :rasta))))
      (rst/complete-sync-task! (:id task)))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for successful?, failed?, and timed-out?
;;; ------------------------------------------------------------------------------------------------

(deftest successful?-test
  (testing "successful? returns true for completed task without error"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/complete-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (true? (rst/successful? completed-task))))))
  (testing "successful? returns false for incomplete task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
      (is (false? (rst/successful? running-task)))
      (rst/complete-sync-task! (:id task))))
  (testing "successful? returns false for failed task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/fail-sync-task! (:id task) "error")
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/successful? failed-task))))))
  (testing "successful? returns false for cancelled task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/cancel-sync-task! (:id task))
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/successful? failed-task)))))))

(deftest failed?-test
  (testing "failed? returns true for task with error and ended_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/fail-sync-task! (:id task) "Connection failed")
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (true? (rst/failed? failed-task))))))
  (testing "failed? returns false for incomplete task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
      (is (false? (rst/failed? running-task)))
      (rst/complete-sync-task! (:id task))))
  (testing "failed? returns false for successful task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/complete-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/failed? completed-task))))))
  (testing "failed? returns false for cancelled task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/cancel-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/failed? completed-task)))))))

(deftest cancelled?-test
  (testing "cancelled? returns true for cancelled tasks"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/cancel-sync-task! (:id task))
      (let [running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (true? (rst/cancelled? running-task))))))
  (testing "cancelled? returns false for incomplete task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
      (is (false? (rst/cancelled? running-task)))
      (rst/complete-sync-task! (:id task))))
  (testing "cancelled? returns false for successful task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/complete-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/cancelled? completed-task))))))
  (testing "cancelled? returns false for task with error and ended_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/fail-sync-task! (:id task) "Connection failed")
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/cancelled? failed-task)))))))

(deftest running?-test
  (testing "running? returns false for cancelled tasks"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/cancel-sync-task! (:id task))
      (let [cancelled-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/running? cancelled-task))))))
  (testing "running? returns true for incomplete task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          running-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
      (is (true? (rst/running? running-task)))
      (rst/complete-sync-task! (:id task))))
  (testing "running? returns false for successful task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/complete-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/running? completed-task))))))
  (testing "running? returns false for task with error and ended_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/fail-sync-task! (:id task) "Connection failed")
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/running? failed-task)))))))

(deftest timed-out?-returns-true-for-stale-task-test
  (testing "timed-out? returns true for incomplete task with old last_progress_report_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          old-time (t/minus (t/offset-date-time) (t/hours 2))]
      (try
        (t2/update! :model/RemoteSyncTask (:id task)
                    {:last_progress_report_at old-time})
        (let [stale-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (true? (rst/timed-out? stale-task))))
        (finally
          (rst/complete-sync-task! (:id task)))))))

(deftest timed-out?-returns-false-for-active-task-test
  (testing "timed-out? returns false for incomplete task with recent last_progress_report_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (try
        (rst/update-progress! (:id task) 0.5)
        (let [active-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (false? (rst/timed-out? active-task))))
        (finally
          (rst/complete-sync-task! (:id task)))))))

(deftest timed-out?-returns-false-for-completed-task-test
  (testing "timed-out? returns false for completed task even with old last_progress_report_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          old-time (t/minus (t/offset-date-time) (t/hours 2))]
      (t2/update! :model/RemoteSyncTask (:id task)
                  {:last_progress_report_at old-time})
      (rst/complete-sync-task! (:id task))
      (let [completed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/timed-out? completed-task)))))))

(deftest timed-out?-returns-false-for-failed-task-test
  (testing "timed-out? returns false for failed task even with old last_progress_report_at"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          old-time (t/minus (t/offset-date-time) (t/hours 2))]
      (t2/update! :model/RemoteSyncTask (:id task)
                  {:last_progress_report_at old-time})
      (rst/fail-sync-task! (:id task) "Task failed")
      (let [failed-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
        (is (false? (rst/timed-out? failed-task)))))))

(deftest timed-out?-returns-false-at-boundary-test
  (testing "timed-out? returns false at time limit boundary"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))
          boundary-time (t/minus (t/offset-date-time) (t/minutes 4))]
      (try
        (t2/update! :model/RemoteSyncTask (:id task)
                    {:last_progress_report_at boundary-time})
        (let [boundary-task (t2/select-one :model/RemoteSyncTask :id (:id task))]
          (is (false? (rst/timed-out? boundary-task))))
        (finally
          (rst/complete-sync-task! (:id task)))))))

(deftest update-progress-throws-on-cancelled-task-test
  (testing "update-progress! throws exception when updating a cancelled task"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/cancel-sync-task! (:id task))
      (is (thrown-with-msg? Exception #"Remote sync task has been cancelled"
                            (rst/update-progress! (:id task) 0.5))))))

(deftest last-version-test
  (testing "When there are no tasks, last-version returns nil"
    (is (nil? (rst/last-version))))
  (testing "When there are no successful tasks, last-version returns nil"
    (let [task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/fail-sync-task! (:id task) "Test failure")
      (is (nil? (rst/last-version)))))
  (testing "Returns last successful version"
    (let [successful-task (rst/create-sync-task! "import" (mt/user->id :rasta))]
      (rst/complete-sync-task! (:id successful-task))
      (rst/set-version! (:id successful-task) "version 1")
      (is (= "version 1" (rst/last-version)))
      (testing "Ignores cancelled tasks"
        (rst/cancel-sync-task! (:id (rst/create-sync-task! "import" (mt/user->id :rasta))))
        (is (= "version 1" (rst/last-version))))
      (testing "Ignores failed tasks"
        (rst/fail-sync-task! (:id (rst/create-sync-task! "import" (mt/user->id :rasta))) "Error")
        (is (= "version 1" (rst/last-version))))
      (testing "Ignores incomplete tasks"
        (is (= "version 1" (rst/last-version))))
      (testing "Returns newer successful tasks"
        (let [new-task (rst/create-sync-task! "import" (mt/user->id :rasta))]
          (rst/complete-sync-task! (:id new-task))
          (rst/set-version! (:id new-task) "version 2")
          (is (= "version 2" (rst/last-version))))))))
