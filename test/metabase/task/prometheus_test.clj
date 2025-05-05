(ns metabase.task.prometheus-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.task.prometheus :as task.prometheus]
   [metabase.test :as mt])
  (:import
   [org.quartz JobDetail JobExecutionContext JobExecutionException JobKey Scheduler TriggerKey Trigger$TriggerState]))

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

(defn- mock-job-execution-context
  "Creates a mock JobExecutionContext."
  ^JobExecutionContext [^String job-name ^long run-time]
  (let [job-key (JobKey. job-name)
        job-detail (reify JobDetail (getKey [_] job-key))]
    (reify JobExecutionContext
      (getJobDetail [_] job-detail)
      (getJobRunTime [_] run-time))))

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
  (testing "Job listener should record metrics with correct tags and values"
    (mt/with-prometheus-system! [_ system]
      (let [listener (task.prometheus/create-job-execution-listener)
            job-name "test-job"
            run-time 123]
        (testing "Successful execution"
          (let [ctx (mock-job-execution-context job-name run-time)
                tags {:status "succeeded" :job-name (str "DEFAULT." job-name)}]
            (.jobWasExecuted listener ctx nil) ; Pass context and nil exception for success
            (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed tags))
                "Counter should increment for successful job with correct tags")
            (is (= 0.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed {:status "failed" :job-name job-name}))
                "Failed counter should remain 0 for the specific job")
            (is (prometheus-test/approx= run-time (:sum (mt/metric-value system :metabase-tasks/quartz-tasks-execution-time-ms tags)))
                "Histogram sum should record the job run time for successful job")
            (is (= 1.0 (:count (mt/metric-value system :metabase-tasks/quartz-tasks-execution-time-ms tags)))
                "Histogram count should increment for successful job")))

        (testing "Failed execution"
          (let [ctx (mock-job-execution-context job-name run-time)
                fail-tags {:status "failed" :job-name (str "DEFAULT." job-name)}
                success-tags {:status "succeeded" :job-name (str "DEFAULT." job-name)}]
            (.jobWasExecuted listener ctx (JobExecutionException. "Test failure")) ; Pass context and an exception for failure
            (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed success-tags))
                "Successful counter should remain unchanged")
            (is (= 1.0 (mt/metric-value system :metabase-tasks/quartz-tasks-executed fail-tags))
                "Counter should increment for failed job with correct tags")
            (is (prometheus-test/approx= run-time (:sum (mt/metric-value system :metabase-tasks/quartz-tasks-execution-time-ms fail-tags)))
                "Histogram sum should record the job run time even for failed job")
            (is (= 1.0 (:count (mt/metric-value system :metabase-tasks/quartz-tasks-execution-time-ms fail-tags)))
                "Histogram count should increment for failed job")
            (is (prometheus-test/approx= run-time (:sum (mt/metric-value system :metabase-tasks/quartz-tasks-execution-time-ms success-tags)))
                "Successful histogram sum should remain unchanged")
            (is (= 1.0 (:count (mt/metric-value system :metabase-tasks/quartz-tasks-execution-time-ms success-tags)))
                "Successful histogram count should remain unchanged")))))))

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
