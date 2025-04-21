(ns metabase.task.prometheus-test
  (:require
   [clojure.test :refer :all]
   [metabase.task.prometheus :as task.prometheus]
   [metabase.test :as mt])
  (:import
   [org.quartz JobExecutionContext JobExecutionException Scheduler TriggerKey Trigger$TriggerState]))

(set! *warn-on-reflection* true)

(defn- trigger-key [^String name]
  (TriggerKey. name))

(defn- mock-scheduler
  "Creates a mock Scheduler with predefined trigger states and executing jobs."
  [trigger-states executing-job-count]
  (let [trigger-keys (->> (range (count trigger-states))
                          (map #(trigger-key (str "trigger-" %)))
                          (into #{}))]
    (reify Scheduler
      (getCurrentlyExecutingJobs [_]
        ;; Return a list of mock JobExecutionContext objects
        (repeat executing-job-count (reify JobExecutionContext)))
      (getTriggerGroupNames [_]
        ;; Assume all triggers are in the default group
        ["DEFAULT"])
      (getTriggerKeys [_ _matcher]
        ;; Return the list of mock TriggerKeys
        trigger-keys)
      (getTriggerState [_ trigger-key]
        ;; Look up the state based on the trigger key's name (index)
        (let [idx (Integer/parseInt (second (re-find #"trigger-(\d+)" (.getName trigger-key))))]
          (get trigger-states idx))))))

(deftest get-quartz-task-states-test
  (testing "should correctly count tasks in various states"
    (let [scheduler (mock-scheduler
                     [Trigger$TriggerState/NORMAL
                      Trigger$TriggerState/NORMAL
                      Trigger$TriggerState/PAUSED
                      Trigger$TriggerState/BLOCKED
                      Trigger$TriggerState/ERROR
                      Trigger$TriggerState/COMPLETE ; Should be ignored
                      nil] ; Should be ignored (or handled gracefully if logic changes)
                     1) ; One executing job
          expected-states {"EXECUTING" 1
                           "WAITING"   2
                           "PAUSED"    1
                           "BLOCKED"   1
                           "ERROR"     1}
          actual-states (into {} (#'task.prometheus/get-quartz-task-states scheduler))]
      (is (= expected-states actual-states))))

  (testing "should return only executing count when no triggers exist"
    (let [scheduler (mock-scheduler [] 2) ; No triggers, 2 executing
          expected-states {"EXECUTING" 2
                           "WAITING"   0
                           "PAUSED"    0
                           "BLOCKED"   0
                           "ERROR"     0}
          actual-states (into {} (#'task.prometheus/get-quartz-task-states scheduler))]
      (is (= expected-states actual-states))))

  (testing "should return empty map when no triggers and no executing jobs"
    (let [scheduler (mock-scheduler [] 0) ; No triggers, 0 executing
          expected-states {"EXECUTING" 0
                           "WAITING"   0
                           "PAUSED"    0
                           "BLOCKED"   0
                           "ERROR"     0}
          actual-states (into {} (#'task.prometheus/get-quartz-task-states scheduler))]
      (is (= expected-states actual-states))))

  (testing "should handle only triggers without executing jobs"
    (let [scheduler (mock-scheduler [Trigger$TriggerState/NORMAL Trigger$TriggerState/PAUSED] 0)
          expected-states {"EXECUTING" 0
                           "WAITING"   1
                           "PAUSED"    1
                           "BLOCKED"   0
                           "ERROR"     0}
          actual-states (into {} (#'task.prometheus/get-quartz-task-states scheduler))]
      (is (= expected-states actual-states)))))

(deftest job-listener-test
  (testing "Job listener should increment the correct counter based on execution status"
    (mt/with-prometheus-system! [_ system]
      (let [listener (task.prometheus/create-job-execution-listener)]
        (testing "Successful execution"
          (.jobWasExecuted listener nil nil) ; Pass nil context and nil exception for success
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed {:status "succeeded"})))
          (is (= 0.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed {:status "failed"}))))

        (testing "Failed execution"
          (.jobWasExecuted listener nil (JobExecutionException. "Test failure")) ; Pass an exception for failure
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed {:status "succeeded"}))) ; Should remain 1
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed {:status "failed"}))))))))

(deftest trigger-listener-test
  (testing "Trigger listener should set the correct gauge values for task states"
    (mt/with-prometheus-system! [_ system]
      (let [scheduler (mock-scheduler
                       [Trigger$TriggerState/NORMAL
                        Trigger$TriggerState/NORMAL
                        Trigger$TriggerState/PAUSED
                        Trigger$TriggerState/BLOCKED
                        Trigger$TriggerState/ERROR]
                       1) ; One executing job
            listener (task.prometheus/create-trigger-listener scheduler)] ; Pass scheduler to listener

        (.triggerComplete listener nil nil nil)

        (testing "Verify gauge values match expected counts"
          ;; Note: The get-quartz-task-states function calculates these based on the mock scheduler
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-states {:state "EXECUTING"})))
          (is (= 2.0 (mt/metric-value system :metabase-tasks/quartz-tasks-states {:state "WAITING"})))
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-states {:state "PAUSED"})))
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-states {:state "BLOCKED"})))
          (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-states {:state "ERROR"}))))))))
