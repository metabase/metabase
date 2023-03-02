(ns metabase.util.log.capture-test
  (:require [clojure.test :refer [deftest testing is]]
            [metabase.util.log :as log]
            [metabase.util.log.capture :as log.capture]))

(deftest ^:parallel ignore-logs-at-finer-level-test
  (testing "Do not capture logs at a finer level"
    (log.capture/with-log-messages-for-level [messages [metabase.util.log.capture-test :debug]]
      (is (= []
             (messages)))
      (let [evaluated? (atom false)]
        (log/trace (do
                     (reset! evaluated? true)
                     "a picture"))
        (is (not @evaluated?)
            "Should not evaluate logged forms that don't get captured")
        (is (= []
               (messages)))))))

(deftest ^:parallel capture-logs-at-same-level-test
  (testing "Capture logs at the same level"
    (log.capture/with-log-messages-for-level [messages [metabase.util.log.capture-test :trace]]
      (is (= []
             (messages)))
      (log/trace "a" "picture")
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :trace
               :e         nil
               :message   "a picture"}]
             (messages))))))

(deftest ^:parallel capture-logs-at-coarser-level-test
  (testing "Capture logs at a coarser level"
    (log.capture/with-log-messages-for-level [messages [metabase.util.log.capture-test :trace]]
      (is (= []
             (messages)))
      (log/debugf "a picture")
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :debug
               :e         nil
               :message   "a picture"}]
             (messages))))))

(deftest ^:parallel capture-child-namespaces-test
  (testing "Should capture logging for child namespaces"
    (log.capture/with-log-messages-for-level [messages ["metabase.util" :trace]]
      (is (= []
             (messages)))
      (log/trace "a picture")
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :trace
               :e         nil
               :message   "a picture"}]
             (messages))))))

(deftest ^:parallel default-namespace-test
  (testing "Capture logs for metabase\\..* by default"
    (log.capture/with-log-messages-for-level [messages :trace]
      (is (= []
             (messages)))
      (log/trace "a picture")
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :trace
               :e         nil
               :message   "a picture"}]
             (messages))))))

(deftest ^:parallel only-capture-child-namespaces-test
  (testing "Capturing logging for metabase.util.log.capture should not capture metabase.util.log.capture-test"
    (log.capture/with-log-messages-for-level [messages ["metabase.util.log.capture" :debug]]
      (is (= []
             (messages)))
      (log/debug "a picture")
      (is (= []
             (messages))))))

(deftest ^:parallel multiple-captures-test
  (testing "Should be able to use `with-log-messages-for-level` multiple times"
    (log.capture/with-log-messages-for-level [util-trace-messages ["metabase.util" :trace]]
      (log.capture/with-log-messages-for-level [test-debug-messages [metabase.util.log.capture-test :debug]]
        (is (= []
               (util-trace-messages)))
        (is (= []
               (test-debug-messages)))
        (testing "trace message should only show up in :trace"
          (log/trace "a picture")
          (is (= [{:namespace 'metabase.util.log.capture-test
                   :level     :trace
                   :e         nil
                   :message   "a picture"}]
                 (util-trace-messages)))
          (is (= []
                 (test-debug-messages))))
        (testing "debug message should show up in :trace and :debug"
          (log/debug "a bug")
          (is (= [{:namespace 'metabase.util.log.capture-test
                   :level     :trace
                   :e         nil
                   :message   "a picture"}
                  {:namespace 'metabase.util.log.capture-test
                   :level     :debug
                   :e         nil
                   :message   "a bug"}]
                 (util-trace-messages)))
          (is (= [{:namespace 'metabase.util.log.capture-test
                   :level     :debug
                   :e         nil
                   :message   "a bug"}]
                 (test-debug-messages))))))))

(deftest ^:parallel multiple-captures-test-2
  (log.capture/with-log-messages-for-level [util-debug-messages ["metabase.util" :debug]
                                            test-trace-messages [metabase.util.log.capture-test :trace]]
    (is (= []
           (util-debug-messages)))
    (is (= []
           (test-trace-messages)))
    (testing "trace message should only show up in :trace"
      (log/tracef "a %s" "picture")
      (is (= []
             (util-debug-messages)))
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :trace
               :e         nil
               :message   "a picture"}]
             (test-trace-messages))))
    (testing "debug message should show up in :trace and :debug"
      (log/debugf "a %s" "bug")
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :debug
               :e         nil
               :message   "a bug"}]
             (util-debug-messages)))
      (is (= [{:namespace 'metabase.util.log.capture-test
               :level     :trace
               :e         nil
               :message   "a picture"}
              {:namespace 'metabase.util.log.capture-test
               :level     :debug
               :e         nil
               :message   "a bug"}]
             (test-trace-messages))))))
