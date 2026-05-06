(ns metabase-enterprise.remote-sync.guards-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-task-table)

(deftest task-running?-returns-false-when-no-tasks-test
  (testing "task-running? returns false when there are no RemoteSyncTask rows"
    (is (false? (guards/task-running?)))))

(deftest task-running?-returns-true-while-task-is-active-test
  (testing "task-running? returns true while a RemoteSyncTask has started_at set and ended_at nil"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :progress       0.0}]
      (is (true? (guards/task-running?))))))

(deftest task-running?-returns-false-when-task-has-ended-test
  (testing "task-running? returns false once the RemoteSyncTask has ended_at set"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :ended_at       (t/offset-date-time)
                                            :progress       1.0}]
      (is (false? (guards/task-running?))))))

(deftest task-running?-catches-stalled-tasks-test
  (testing "task-running? returns true even for tasks that haven't reported progress in a long time —
            this is the key difference from current-task, which filters out stale tasks via
            last_progress_report_at to allow recovery from hangs at the create-task layer"
    (let [two-hours-ago (t/minus (t/offset-date-time) (t/hours 2))]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type          "import"
                                              :initiated_by            (mt/user->id :rasta)
                                              :started_at              two-hours-ago
                                              :last_progress_report_at two-hours-ago
                                              :progress                0.5}]
        (is (true? (guards/task-running?))
            "task-running? must catch the stalled task")
        (is (nil? (remote-sync.task/current-task))
            "for contrast: current-task deliberately filters this out to allow new tasks to be created
             after the staleness window, so a hung task doesn't permanently block the system")))))
