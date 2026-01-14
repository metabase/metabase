(ns metabase.task-history.models.task-run-test
  "Tests for TaskRun model and with-task-run macro."
  (:require
   [clojure.test :refer :all]
   [metabase.task-history.core :as task-history]
   [metabase.task-history.models.task-run :as task-run]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            with-task-run basic tests                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest with-task-run-creates-run-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "with-task-run creates a task run record"
      (task-history/with-task-run {:run_type    :sync
                                   :entity_type :database
                                   :entity_id   1}
        (is (some? (task-history/current-run-id)) "run-id is bound")
        (let [run (t2/select-one :model/TaskRun :id (task-history/current-run-id))]
          (is (= :started (:status run)) "status is :started during execution")
          (is (= :sync (:run_type run)))
          (is (= :database (:entity_type run)))
          (is (= 1 (:entity_id run))))))))

(deftest with-task-run-auto-complete-success-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "with-task-run auto-completes with :success when children all succeed"
      (let [run-id (atom nil)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (reset! run-id (task-history/current-run-id))
          (task-history/with-task-history {:task "test-task-1"}
            :done)
          (task-history/with-task-history {:task "test-task-2"}
            :done))
        (let [run (t2/select-one :model/TaskRun :id @run-id)]
          (is (= :success (:status run)))
          (is (some? (:ended_at run))))))))

(deftest with-task-run-auto-complete-failure-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "with-task-run auto-completes with :failed when any child fails"
      (let [run-id (atom nil)]
        (try
          (task-history/with-task-run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   1}
            (reset! run-id (task-history/current-run-id))
            (task-history/with-task-history {:task "test-task-1"}
              :done)
            (task-history/with-task-history {:task "test-task-2"}
              (throw (Exception. "fail"))))
          (catch Exception _))
        (let [run (t2/select-one :model/TaskRun :id @run-id)]
          (is (= :failed (:status run)))
          (is (some? (:ended_at run))))))))

(deftest with-task-run-auto-complete-false-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "with-task-run does NOT auto-complete when :auto-complete false"
      (let [run-id (atom nil)]
        (task-history/with-task-run {:run_type      :subscription
                                     :entity_type   :dashboard
                                     :entity_id     1
                                     :auto-complete false}
          (reset! run-id (task-history/current-run-id))
          (task-history/with-task-history {:task "test-task"}
            :done))
        (let [run (t2/select-one :model/TaskRun :id @run-id)]
          (is (= :started (:status run)) "status remains :started")
          (is (nil? (:ended_at run)) "ended_at is nil"))
        ;; Manual completion
        (task-history/complete-task-run! @run-id)
        (let [run (t2/select-one :model/TaskRun :id @run-id)]
          (is (= :success (:status run)))
          (is (some? (:ended_at run))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Nesting prevention tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest with-task-run-prevents-nesting-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "nested with-task-run does not create a new run"
      (let [outer-run-id (atom nil)
            inner-run-id (atom nil)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (reset! outer-run-id (task-history/current-run-id))
          (task-history/with-task-run {:run_type    :sync
                                       :entity_type :database
                                       :entity_id   2}
            (reset! inner-run-id (task-history/current-run-id))))
        (is (= @outer-run-id @inner-run-id) "inner run uses same run-id")
        (is (= 1 (t2/count :model/TaskRun)) "only one run created")))))

(deftest with-task-run-nil-info-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "with-task-run with nil run-info just executes body"
      (task-history/with-task-run nil
        (is (nil? (task-history/current-run-id)) "run-id remains nil"))
      (is (zero? (t2/count :model/TaskRun)) "no run created"))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          complete-task-run! tests                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest complete-task-run-derives-status-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "complete-task-run! derives :success when all children succeed"
      (let [run-id (task-run/create-task-run! {:run_type    :sync
                                               :entity_type :database
                                               :entity_id   1})]
        (with-redefs [task-run/current-run-id (constantly run-id)]
          (task-history/with-task-history {:task "t1"} :ok)
          (task-history/with-task-history {:task "t2"} :ok))
        (task-history/complete-task-run! run-id)
        (is (= :success (:status (t2/select-one :model/TaskRun :id run-id))))))

    (testing "complete-task-run! derives :failed when any child failed"
      (let [run-id (task-run/create-task-run! {:run_type    :sync
                                               :entity_type :database
                                               :entity_id   1})]
        (with-redefs [task-run/current-run-id (constantly run-id)]
          (task-history/with-task-history {:task "t1"} :ok)
          (try
            (task-history/with-task-history {:task "t2"}
              (throw (Exception. "fail")))
            (catch Exception _)))
        (task-history/complete-task-run! run-id)
        (is (= :failed (:status (t2/select-one :model/TaskRun :id run-id))))))))

(deftest complete-task-run-idempotent-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "complete-task-run! is idempotent - only updates if status is :started"
      (let [run-id (task-run/create-task-run! {:run_type    :sync
                                               :entity_type :database
                                               :entity_id   1})]
        (with-redefs [task-run/current-run-id (constantly run-id)]
          (task-history/with-task-history {:task "t1"} :ok))
        ;; First completion
        (task-history/complete-task-run! run-id)
        (let [first-ended-at (:ended_at (t2/select-one :model/TaskRun :id run-id))]
          (is (= :success (:status (t2/select-one :model/TaskRun :id run-id))))
          ;; Add a failing task and try to complete again
          (with-redefs [task-run/current-run-id (constantly run-id)]
            (try
              (task-history/with-task-history {:task "t2"}
                (throw (Exception. "fail")))
              (catch Exception _)))
          ;; Second completion should be no-op
          (task-history/complete-task-run! run-id)
          (let [run (t2/select-one :model/TaskRun :id run-id)]
            (is (= :success (:status run)) "status unchanged")
            (is (= first-ended-at (:ended_at run)) "ended_at unchanged")))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       run-id propagation (async) tests                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest run-id-meta-propagation-test
  (mt/with-model-cleanup [:model/TaskRun]
    (testing "with-run-id-meta and with-restored-run-id propagate run-id via metadata"
      (let [captured-run-id (atom nil)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (let [data (task-history/with-run-id-meta {:some "data"})
                original-run-id (task-history/current-run-id)]
            ;; Simulate async - outside the with-task-run
            (is (some? original-run-id) "run-id is set")
            ;; Restore from metadata in a new context
            (task-history/with-restored-run-id data
              (reset! captured-run-id (task-history/current-run-id)))
            (is (= original-run-id @captured-run-id) "run-id restored from metadata")))))))

(deftest run-id-meta-nil-propagation-test
  (testing "with-restored-run-id handles nil metadata gracefully"
    (let [data {}]
      (task-history/with-restored-run-id data
        (is (nil? (task-history/current-run-id)) "run-id is nil when not in metadata")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      task_history.run_id integration                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest task-history-gets-run-id-test
  (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
    (testing "task history created within with-task-run gets run_id populated"
      (let [task-name (mt/random-name)]
        (task-history/with-task-run {:run_type    :sync
                                     :entity_type :database
                                     :entity_id   1}
          (task-history/with-task-history {:task task-name}
            :done))
        (let [th (t2/select-one :model/TaskHistory :task task-name)]
          (is (some? (:run_id th)) "run_id is set"))))

    (testing "task history created outside with-task-run has nil run_id"
      (let [task-name (mt/random-name)]
        (task-history/with-task-history {:task task-name}
          :done)
        (let [th (t2/select-one :model/TaskHistory :task task-name)]
          (is (nil? (:run_id th)) "run_id is nil"))))))
