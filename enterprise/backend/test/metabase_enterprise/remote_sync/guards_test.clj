(ns metabase-enterprise.remote-sync.guards-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-task-table)

(deftest task-running?-returns-false-when-no-tasks-test
  (testing "task-running? returns false when there are no RemoteSyncTask rows"
    (is (false? (guards/task-running?)))))

(deftest task-running?-returns-true-while-task-is-active-test
  (testing "task-running? returns true while a RemoteSyncTask is started, not ended, and reporting
            progress recently"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type          "import"
                                            :initiated_by            (mt/user->id :rasta)
                                            :started_at              (t/offset-date-time)
                                            :last_progress_report_at (t/offset-date-time)
                                            :progress                0.0}]
      (is (true? (guards/task-running?))))))

(deftest task-running?-returns-false-when-task-has-ended-test
  (testing "task-running? returns false once the RemoteSyncTask has ended_at set"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :ended_at       (t/offset-date-time)
                                            :progress       1.0}]
      (is (false? (guards/task-running?))))))

(deftest task-running?-returns-false-for-stalled-tasks-test
  (testing "task-running? returns false for tasks that haven't reported progress within the
            timeout window — stale rows should not block operations; ensure-no-active-task!
            cleans them up via supersede-stale-tasks! after the check passes"
    (let [two-hours-ago (t/minus (t/offset-date-time) (t/hours 2))]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type          "import"
                                              :initiated_by            (mt/user->id :rasta)
                                              :started_at              two-hours-ago
                                              :last_progress_report_at two-hours-ago
                                              :progress                0.5}]
        (is (false? (guards/task-running?))
            "stalled task must not block operations")))))

(deftest ensure-no-active-task!-supersedes-stale-tasks-test
  (testing "ensure-no-active-task! does not throw for stale tasks AND supersedes them so
            user-driven operations self-heal from JVM-died/stuck-thread orphans"
    (let [two-hours-ago (t/minus (t/offset-date-time) (t/hours 2))
          stale-task    (t2/insert-returning-instance!
                         :model/RemoteSyncTask
                         {:sync_task_type          "import"
                          :initiated_by            (mt/user->id :rasta)
                          :started_at              two-hours-ago
                          :last_progress_report_at two-hours-ago
                          :progress                0.5})]
      (guards/ensure-no-active-task!)
      (let [after (t2/select-one :model/RemoteSyncTask :id (:id stale-task))]
        (is (true? (:cancelled after))
            "stale task must be marked cancelled by ensure-no-active-task!")
        (is (some? (:ended_at after))
            "stale task must be terminated by ensure-no-active-task!")))))
