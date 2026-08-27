(ns metabase.mq.init-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.init :as mq.init]
   [metabase.startup.core :as startup]
   [metabase.task.core :as task]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest resolve-queue-be-default-test
  (testing "with no explicit queue-backend setting"
    (mt/with-temporary-setting-values [queue-backend nil]
      (testing "defaults to quartz when the scheduler is enabled"
        (with-redefs [task/scheduler-disabled? (constantly false)]
          (is (= :queue.backend/quartz (#'mq.init/resolve-queue-be)))))
      (testing "defaults to memory when the scheduler is disabled"
        (with-redefs [task/scheduler-disabled? (constantly true)]
          (is (= :queue.backend/memory (#'mq.init/resolve-queue-be))))))))

(deftest resolve-queue-be-explicit-test
  (testing "an explicitly set queue-backend wins regardless of the scheduler"
    (doseq [[setting-value disabled? expected] [["quartz" false :queue.backend/quartz]
                                                ["memory" false :queue.backend/memory]
                                                ["memory" true  :queue.backend/memory]]]
      (mt/with-temporary-setting-values [queue-backend setting-value]
        (with-redefs [task/scheduler-disabled? (constantly disabled?)]
          (is (= expected (#'mq.init/resolve-queue-be))))))))

(deftest startup-validation-test
  (testing "an explicitly configured quartz backend + disabled scheduler aborts startup"
    (mt/with-temporary-setting-values [queue-backend "quartz"]
      (with-redefs [task/scheduler-disabled? (constantly true)]
        (is (thrown-with-msg? ExceptionInfo #"scheduler is disabled"
                              (startup/def-startup-validation! ::mq.init/MqBackendValidation))))))
  (testing "validation passes when"
    (testing "quartz is merely the default (a disabled scheduler falls back to memory)"
      (mt/with-temporary-setting-values [queue-backend nil]
        (with-redefs [task/scheduler-disabled? (constantly true)]
          (is (nil? (startup/def-startup-validation! ::mq.init/MqBackendValidation))))))
    (testing "quartz is explicit and the scheduler is enabled"
      (mt/with-temporary-setting-values [queue-backend "quartz"]
        (with-redefs [task/scheduler-disabled? (constantly false)]
          (is (nil? (startup/def-startup-validation! ::mq.init/MqBackendValidation))))))
    (testing "memory is explicit and the scheduler is disabled"
      (mt/with-temporary-setting-values [queue-backend "memory"]
        (with-redefs [task/scheduler-disabled? (constantly true)]
          (is (nil? (startup/def-startup-validation! ::mq.init/MqBackendValidation)))))))
  (testing "an unknown explicit backend aborts startup"
    (mt/with-temporary-setting-values [queue-backend "bogus"]
      (with-redefs [task/scheduler-disabled? (constantly false)]
        (is (thrown-with-msg? ExceptionInfo #"Invalid queue backend"
                              (startup/def-startup-validation! ::mq.init/MqBackendValidation)))))))
