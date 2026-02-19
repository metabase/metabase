(ns metabase.task-history.task.task-run-heartbeat-test
  "Tests for task run heartbeat and orphan cleanup."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.task-history.task.task-run-heartbeat :as heartbeat]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             send-heartbeat! tests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest send-heartbeat-updates-own-runs-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "send-heartbeat! updates updated_at for runs belonging to current process"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :started
                                                    :started_at   old-time
                                                    :updated_at   old-time
                                                    :process_uuid config/local-process-uuid}]
          (heartbeat/send-heartbeat!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (t/after? (:updated_at run) old-time) "updated_at was bumped")))))))

(deftest send-heartbeat-ignores-other-processes-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "send-heartbeat! does NOT update runs belonging to other processes"
      (let [old-time      (t/minus (t/offset-date-time) (t/hours 3))
            other-uuid    "other-process-uuid"]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :started
                                                    :started_at   old-time
                                                    :updated_at   old-time
                                                    :process_uuid other-uuid}]
          (heartbeat/send-heartbeat!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            ;; Compare truncated to millis due to DB precision differences
            (is (= (t/truncate-to old-time :millis)
                   (t/truncate-to (:updated_at run) :millis))
                "updated_at unchanged for other process")))))))

(deftest send-heartbeat-ignores-completed-runs-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "send-heartbeat! does NOT update runs that are already completed"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :success
                                                    :started_at   old-time
                                                    :updated_at   old-time
                                                    :ended_at     old-time
                                                    :process_uuid config/local-process-uuid}]
          (heartbeat/send-heartbeat!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            ;; Compare truncated to millis due to DB precision differences
            (is (= (t/truncate-to old-time :millis)
                   (t/truncate-to (:updated_at run) :millis))
                "updated_at unchanged for completed run")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          mark-orphaned-runs! tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest mark-orphaned-runs-marks-old-runs-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "mark-orphaned-runs! marks runs with old updated_at as :abandoned"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :started
                                                    :started_at   old-time
                                                    :updated_at   old-time
                                                    :process_uuid "dead-process"}]
          (heartbeat/mark-orphaned-runs!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (= :abandoned (:status run)) "status changed to :abandoned")
            (is (some? (:ended_at run)) "ended_at was set")))))))

(deftest mark-orphaned-runs-ignores-recent-runs-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "mark-orphaned-runs! does NOT mark runs with recent updated_at"
      (let [recent-time (t/minus (t/offset-date-time) (t/minutes 30))]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :started
                                                    :started_at   recent-time
                                                    :updated_at   recent-time
                                                    :process_uuid "some-process"}]
          (heartbeat/mark-orphaned-runs!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (= :started (:status run)) "status unchanged")
            (is (nil? (:ended_at run)) "ended_at still nil")))))))

(deftest mark-orphaned-runs-ignores-completed-runs-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "mark-orphaned-runs! does NOT mark already-completed runs"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :success
                                                    :started_at   old-time
                                                    :updated_at   old-time
                                                    :ended_at     old-time
                                                    :process_uuid "dead-process"}]
          (heartbeat/mark-orphaned-runs!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (= :success (:status run)) "status unchanged")))))))

(deftest mark-orphaned-runs-marks-long-running-runs-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "mark-orphaned-runs! marks runs older than 24 hours even with recent heartbeat"
      (let [very-old-time (t/minus (t/offset-date-time) (t/hours 30))
            recent-time   (t/offset-date-time)]
        (mt/with-temp [:model/TaskRun {run-id :id} {:run_type     :sync
                                                    :entity_type  :database
                                                    :entity_id    1
                                                    :status       :started
                                                    :started_at   very-old-time ; started 30 hours ago
                                                    :updated_at   recent-time   ; but has recent heartbeat
                                                    :process_uuid config/local-process-uuid}]
          (heartbeat/mark-orphaned-runs!)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (= :abandoned (:status run)) "status changed to :abandoned for long-running run")
            (is (some? (:ended_at run)) "ended_at was set")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         mark-orphaned-tasks! tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest mark-orphaned-tasks-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "mark-orphaned-tasks! marks started tasks belonging to orphaned runs"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        (mt/with-temp [:model/TaskRun     {run-id :id} {:run_type     :sync
                                                        :entity_type  :database
                                                        :entity_id    1
                                                        :status       :abandoned ; already orphaned
                                                        :started_at   old-time
                                                        :updated_at   old-time
                                                        :ended_at     old-time
                                                        :process_uuid "dead-process"}
                       :model/TaskHistory {task-id :id} {:task       "stuck-task"
                                                         :run_id     run-id
                                                         :status     :started
                                                         :started_at old-time}]
          (heartbeat/mark-orphaned-tasks! #{run-id})
          (let [task (t2/select-one :model/TaskHistory :id task-id)]
            (is (= :unknown (:status task)) "task status changed to :unknown")
            (is (some? (:ended_at task)) "task ended_at was set")))))))

(deftest mark-orphaned-tasks-ignores-completed-tasks-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "mark-orphaned-tasks! does NOT mark already-completed tasks"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        (mt/with-temp [:model/TaskRun     {run-id :id} {:run_type     :sync
                                                        :entity_type  :database
                                                        :entity_id    1
                                                        :status       :abandoned ; orphaned
                                                        :started_at   old-time
                                                        :updated_at   old-time
                                                        :ended_at     old-time
                                                        :process_uuid "dead-process"}
                       :model/TaskHistory {task-id :id} {:task       "completed-task"
                                                         :run_id     run-id
                                                         :status     :success
                                                         :started_at old-time
                                                         :ended_at   old-time
                                                         :duration   100}]
          (heartbeat/mark-orphaned-tasks! #{run-id})
          (let [task (t2/select-one :model/TaskHistory :id task-id)]
            (is (= :success (:status task)) "task status unchanged")))))))

(deftest mark-orphaned-tasks-ignores-other-runs-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "mark-orphaned-tasks! does NOT mark tasks belonging to runs not in the provided set"
      (let [recent-time (t/offset-date-time)]
        (mt/with-temp [:model/TaskRun     {run-id :id} {:run_type     :sync
                                                        :entity_type  :database
                                                        :entity_id    1
                                                        :status       :started
                                                        :started_at   recent-time
                                                        :updated_at   recent-time
                                                        :process_uuid config/local-process-uuid}
                       :model/TaskHistory {task-id :id} {:task       "running-task"
                                                         :run_id     run-id
                                                         :status     :started
                                                         :started_at recent-time}]
          ;; Pass empty set - no runs should be affected
          (heartbeat/mark-orphaned-tasks! #{})
          (let [task (t2/select-one :model/TaskHistory :id task-id)]
            (is (= :started (:status task)) "task status unchanged")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Integration tests                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest full-heartbeat-cycle-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "full heartbeat cycle: heartbeat, orphan detection, task cleanup"
      (let [old-time (t/minus (t/offset-date-time) (t/hours 3))]
        ;; Create runs: one from current process (should get heartbeat), one from dead process (should be orphaned)
        (mt/with-temp [:model/TaskRun     {live-run-id :id}  {:run_type     :sync
                                                              :entity_type  :database
                                                              :entity_id    1
                                                              :status       :started
                                                              :started_at   old-time
                                                              :updated_at   old-time
                                                              :process_uuid config/local-process-uuid}
                       :model/TaskRun     {dead-run-id :id}  {:run_type     :sync
                                                              :entity_type  :database
                                                              :entity_id    2
                                                              :status       :started
                                                              :started_at   old-time
                                                              :updated_at   old-time
                                                              :process_uuid "dead-process"}
                       :model/TaskHistory {live-task-id :id} {:task       "live-task"
                                                              :run_id     live-run-id
                                                              :status     :started
                                                              :started_at old-time}
                       :model/TaskHistory {dead-task-id :id} {:task       "dead-task"
                                                              :run_id     dead-run-id
                                                              :status     :started
                                                              :started_at old-time}]
          ;; Run heartbeat cycle
          (heartbeat/send-heartbeat!)
          (let [orphaned-run-ids (heartbeat/mark-orphaned-runs!)]
            (heartbeat/mark-orphaned-tasks! orphaned-run-ids))

          ;; Live run should have updated heartbeat, dead run should be orphaned
          (let [live-run (t2/select-one :model/TaskRun :id live-run-id)
                dead-run (t2/select-one :model/TaskRun :id dead-run-id)]
            (is (= :started (:status live-run)) "live run still started")
            (is (t/after? (:updated_at live-run) old-time) "live run got heartbeat")
            (is (= :abandoned (:status dead-run)) "dead run marked abandoned")
            (is (some? (:ended_at dead-run)) "dead run has ended_at"))

          ;; Live task should be unchanged, dead task should be marked unknown
          (let [live-task (t2/select-one :model/TaskHistory :id live-task-id)
                dead-task (t2/select-one :model/TaskHistory :id dead-task-id)]
            (is (= :started (:status live-task)) "live task still started")
            (is (= :unknown (:status dead-task)) "dead task marked unknown")
            (is (some? (:ended_at dead-task)) "dead task has ended_at")))))))
