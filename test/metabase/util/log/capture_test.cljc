(ns metabase.util.log.capture-test
  (:require
   #?@(:cljs
       [[metabase.test-runner.assert-exprs.approximately-equal]])
   [clojure.test :refer [deftest testing is are]]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]))

#?(:cljs
   (comment
     metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel basic-logp-test
  (is (= [{:namespace 'metabase.util.log.capture-test, :level :warn, :e nil, :message "a message"}]
         (log.capture/with-log-messages-for-level [messages :warn]
           (log/info "not this one")
           (log/warn "a message")
           (messages))))
  (is (= [{:namespace 'metabase.util.log.capture-test, :level :info, :e nil, :message "here's one"}
          {:namespace 'metabase.util.log.capture-test, :level :warn, :e nil, :message "a message"}]
         (log.capture/with-log-messages-for-level [messages :info]
           (log/info "here's one")
           (log/warn "a message")
           (messages))))
  (is (= [{:namespace 'metabase.util.log.capture-test, :level :info, :e nil, :message ":keyword 78"}]
         (log.capture/with-log-messages-for-level [messages :info]
           (log/info :keyword 78)
           (messages)))))

(deftest ^:parallel logp-levels-test
  (let [important-message #{"fatal" "error" "warn" "info" "debug" "trace"}
        spam (fn []
               (log/fatal "fatal")
               (log/error "error")
               (log/warn  "warn")
               (log/info  "info")
               (log/debug "debug")
               (log/trace "trace"))
        logs [{:namespace 'metabase.util.log.capture-test, :level :fatal, :e nil, :message "fatal"}
              {:namespace 'metabase.util.log.capture-test, :level :error, :e nil, :message "error"}
              {:namespace 'metabase.util.log.capture-test, :level :warn, :e  nil, :message "warn"}
              {:namespace 'metabase.util.log.capture-test, :level :info, :e  nil, :message "info"}
              {:namespace 'metabase.util.log.capture-test, :level :debug, :e nil, :message "debug"}
              {:namespace 'metabase.util.log.capture-test, :level :trace, :e nil, :message "trace"}]]
    (are [prefix level] (= (->> logs
                                (filter #(contains? important-message (:message %)))
                                (take prefix))
                           (log.capture/with-log-messages-for-level [messages level]
                             (spam)
                             (messages)))
                                        ;0 :off - this doesn't work in CLJ and perhaps should?
      1 :fatal
      2 :error
      3 :warn
      4 :info
      5 :debug
      6 :trace)))

(deftest ^:parallel logf-formatting-test
  (is (= [{:namespace 'metabase.util.log.capture-test, :level :info, :e nil, :message "input: 8, 3; output: ignored"}]
         (log.capture/with-log-messages-for-level [messages :info]
           (log/infof "input: %d, %d; %s: ignored" 8 3 "output")
           (messages)))))

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
      (log/debug "a picture")
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

(deftest ^:parallel preserve-formatting-test
  ;; for whatever reason `logp` uses the equivalent of [[print-str]] while `logf` uses the equivalent of [[str]]
  (testing 'logp
    (log.capture/with-log-messages-for-level [messages :info]
      (log/info "Something:" "s" [:vector "string"])
      (is (=? [{:message "Something: s [:vector string]"}]
              (messages)))))
  (testing 'logf
    (log.capture/with-log-messages-for-level [messages :info]
      (log/infof "Something: %s %s" "s" [:vector "string"])
      (is (=? [{:message "Something: s [:vector \"string\"]"}]
              (messages))))))
