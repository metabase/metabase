(ns metabase.task.job-factory-test
  (:require
   [clojure.test :refer :all]
   [metabase.task.job-factory :as sut]
   [metabase.test :as mt])
  (:import
   (org.quartz Job JobExecutionContext)
   (org.quartz.spi JobFactory)))

(set! *warn-on-reflection* true)

(deftest new-job-class-not-found-test
  (testing "JobFactory should return a no-op job and log an error when the underlying factory fails to load the class"
    (testing "Handles ClassNotFoundException"
      (mt/with-log-messages-for-level [logs :error]
        (let [custom-factory (sut/create (reify JobFactory
                                           (newJob [_ _ _]
                                             (throw (java.lang.ClassNotFoundException. "Test ClassNotFoundException")))))]
          (is (instance? Job (.newJob custom-factory nil nil))
              "Should return a Job instance"))
        (is (some #(re-find #"Failed to load a job class. Usually this means an old version of metabase tried to run a job from a newer version" %)
                  (map :message (logs)))
            "Should log an error about failing to load the job class")))))

(deftest new-job-no-class-def-found-test
  (testing "JobFactory should return a no-op job and log an error when the underlying factory fails to load the class"
    (testing "Handles NoClassDefFoundError"
      (mt/with-log-messages-for-level [logs :error]
        (let [custom-factory (sut/create (reify JobFactory
                                           (newJob [_ _ _]
                                             (throw (java.lang.NoClassDefFoundError. "Test NoClassDefFoundError")))))]
          (is (instance? Job (.newJob custom-factory nil nil))
              "Should return a Job instance"))
        (is (some #(re-find #"Failed to load a job class. Usually this means an old version of metabase tried to run a job from a newer version" %)
                  (map :message (logs)))
            "Should log an error about failing to load the job class")))))

(deftest create-listener-test
  (testing "The TriggerListener returned by create-listener should veto NoOpJob instances"
    (let [listener (sut/create-listener)
          noop-job (#'sut/->NoOpJob) ; Access private record constructor
          other-job (reify Job (execute [_ _]))]

      (testing "should return true (veto) for NoOpJob"
        (let [context (reify JobExecutionContext
                        (getJobInstance [_] noop-job))]
          (is (true? (.vetoJobExecution listener nil context))
              "Listener should veto NoOpJob")))

      (testing "should return false (don't veto) for other Job types"
        (let [context (reify JobExecutionContext
                        (getJobInstance [_] other-job))]
          (is (false? (.vetoJobExecution listener nil context))
              "Listener should not veto other job types"))))))
