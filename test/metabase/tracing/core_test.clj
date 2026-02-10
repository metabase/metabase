(ns metabase.tracing.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.tracing.core :as tracing])
  (:import
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(deftest group-enabled?-disabled-by-default-test
  (testing "group-enabled? returns false when tracing is not initialized"
    ;; By default, enabled-groups atom is nil (tracing not initialized)
    (is (not (tracing/group-enabled? :qp)))
    (is (not (tracing/group-enabled? :sync)))
    (is (not (tracing/group-enabled? :api)))))

(deftest init-enabled-groups!-all-test
  (testing "init-enabled-groups! with 'all' enables all groups"
    (try
      (tracing/init-enabled-groups! "all" "INFO")
      (is (tracing/group-enabled? :qp))
      (is (tracing/group-enabled? :sync))
      (is (tracing/group-enabled? :api))
      (is (tracing/group-enabled? :db-user))
      (is (tracing/group-enabled? :db-app))
      (is (tracing/group-enabled? :tasks))
      (is (tracing/group-enabled? :events))
      ;; even non-registered groups should be enabled with :all
      (is (tracing/group-enabled? :nonexistent-group))
      (finally
        (tracing/shutdown-groups!)))))

(deftest init-enabled-groups!-selective-test
  (testing "init-enabled-groups! with comma-separated list enables only those groups"
    (try
      (tracing/init-enabled-groups! "qp,api,db-user" "INFO")
      (is (tracing/group-enabled? :qp))
      (is (tracing/group-enabled? :api))
      (is (tracing/group-enabled? :db-user))
      (is (not (tracing/group-enabled? :sync)))
      (is (not (tracing/group-enabled? :tasks)))
      (is (not (tracing/group-enabled? :events)))
      (is (not (tracing/group-enabled? :db-app)))
      (finally
        (tracing/shutdown-groups!)))))

(deftest init-enabled-groups!-whitespace-test
  (testing "init-enabled-groups! handles whitespace in group names"
    (try
      (tracing/init-enabled-groups! " qp , sync " "INFO")
      (is (tracing/group-enabled? :qp))
      (is (tracing/group-enabled? :sync))
      (is (not (tracing/group-enabled? :api)))
      (finally
        (tracing/shutdown-groups!)))))

(deftest shutdown-groups!-test
  (testing "shutdown-groups! disables all groups"
    (tracing/init-enabled-groups! "all" "INFO")
    (is (tracing/group-enabled? :qp))
    (tracing/shutdown-groups!)
    (is (not (tracing/group-enabled? :qp)))))

(deftest register-group!-test
  (testing "register-group! adds groups to the registry"
    (tracing/register-group! :test-group "A test group")
    (is (contains? (tracing/registered-groups) :test-group))
    (is (= "A test group" (:description (:test-group (tracing/registered-groups)))))))

(deftest built-in-groups-registered-test
  (testing "all built-in groups are registered"
    (let [groups (tracing/registered-groups)]
      (is (contains? groups :qp))
      (is (contains? groups :sync))
      (is (contains? groups :tasks))
      (is (contains? groups :api))
      (is (contains? groups :db-user))
      (is (contains? groups :db-app))
      (is (contains? groups :events)))))

(deftest with-span-disabled-executes-body-test
  (testing "with-span executes body when tracing is disabled (no-op wrapper)"
    ;; Tracing not initialized, so group-enabled? returns false
    (tracing/shutdown-groups!)
    (is (= 42 (tracing/with-span :qp "test-span" {} 42)))
    (is (= "hello" (tracing/with-span :qp "test-span" {} "hello")))
    (let [side-effect (atom false)]
      (tracing/with-span :qp "test-span" {}
        (reset! side-effect true))
      (is @side-effect))))

(deftest inject-trace-level-into-mdc-test
  (testing "inject-trace-id-into-mdc! sets trace_level in MDC from cached setting"
    (try
      (tracing/init-enabled-groups! "all" "DEBUG")
      (tracing/inject-trace-id-into-mdc!)
      (is (= "DEBUG" (ThreadContext/get "trace_level")))
      (tracing/clear-trace-id-from-mdc!)
      (is (nil? (ThreadContext/get "trace_level")))
      (finally
        (tracing/shutdown-groups!))))
  (testing "inject-trace-id-into-mdc! does not set trace_level when tracing is not initialized"
    (tracing/shutdown-groups!)
    (tracing/inject-trace-id-into-mdc!)
    (is (nil? (ThreadContext/get "trace_level")))
    (tracing/clear-trace-id-from-mdc!)))

(deftest trace-log-level-values-test
  (testing "each valid log level is correctly cached and injected into MDC"
    (doseq [level ["INFO" "DEBUG" "TRACE"]]
      (testing (str "level=" level)
        (try
          (tracing/init-enabled-groups! "all" level)
          (tracing/inject-trace-id-into-mdc!)
          (is (= level (ThreadContext/get "trace_level")))
          (finally
            (tracing/clear-trace-id-from-mdc!)
            (tracing/shutdown-groups!)))))))

(deftest trace-log-level-nil-defaults-to-info-test
  (testing "nil log-level-str defaults to INFO"
    (try
      (tracing/init-enabled-groups! "all" nil)
      (tracing/inject-trace-id-into-mdc!)
      (is (= "INFO" (ThreadContext/get "trace_level")))
      (finally
        (tracing/clear-trace-id-from-mdc!)
        (tracing/shutdown-groups!)))))

(deftest shutdown-clears-trace-log-level-test
  (testing "shutdown-groups! clears trace_level so MDC injection becomes a no-op"
    (tracing/init-enabled-groups! "all" "DEBUG")
    (tracing/shutdown-groups!)
    (tracing/inject-trace-id-into-mdc!)
    (is (nil? (ThreadContext/get "trace_level")))
    (tracing/clear-trace-id-from-mdc!)))

(deftest reinit-changes-trace-log-level-test
  (testing "re-initializing with a different log level updates the cached value"
    (try
      (tracing/init-enabled-groups! "all" "DEBUG")
      (tracing/inject-trace-id-into-mdc!)
      (is (= "DEBUG" (ThreadContext/get "trace_level")))
      (tracing/clear-trace-id-from-mdc!)
      ;; re-init with different level
      (tracing/init-enabled-groups! "all" "TRACE")
      (tracing/inject-trace-id-into-mdc!)
      (is (= "TRACE" (ThreadContext/get "trace_level")))
      (finally
        (tracing/clear-trace-id-from-mdc!)
        (tracing/shutdown-groups!)))))

;;; ------------------------------------------ Forced Trace ID Tests -------------------------------------------

(deftest force-trace-id-basic-test
  (testing "force-trace-id! sets value, get-and-clear-forced-trace-id! returns and clears it"
    (tracing/force-trace-id! "abcdef1234567890abcdef1234567890")
    (is (= "abcdef1234567890abcdef1234567890" (tracing/get-and-clear-forced-trace-id!)))
    ;; second call returns nil (already consumed)
    (is (nil? (tracing/get-and-clear-forced-trace-id!)))))

(deftest force-trace-id-nil-when-not-set-test
  (testing "get-and-clear-forced-trace-id! returns nil when nothing is forced"
    (tracing/clear-forced-trace-id!)
    (is (nil? (tracing/get-and-clear-forced-trace-id!)))))

(deftest clear-forced-trace-id-test
  (testing "clear-forced-trace-id! removes the value without consuming it"
    (tracing/force-trace-id! "1111111111111111aaaaaaaaaaaaaaaa")
    (tracing/clear-forced-trace-id!)
    (is (nil? (tracing/get-and-clear-forced-trace-id!)))))

(deftest force-trace-id-thread-isolation-test
  (testing "forced trace ID is thread-local — other threads don't see it"
    (tracing/force-trace-id! "aaaa0000bbbb1111cccc2222dddd3333")
    (let [other-thread-result (promise)]
      (.start (Thread. (fn []
                         (deliver other-thread-result (tracing/get-and-clear-forced-trace-id!)))))
      (is (nil? (deref other-thread-result 1000 :timeout)))
      ;; still available on this thread
      (is (= "aaaa0000bbbb1111cccc2222dddd3333" (tracing/get-and-clear-forced-trace-id!))))))
