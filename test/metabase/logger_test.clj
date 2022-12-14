(ns metabase.logger-test
  (:require [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [clojure.tools.logging.impl :as log.impl]
            [metabase.logger :as mb.logger]
            [metabase.test :as mt]))

(deftest added-appender-tests
  (testing "appender is added to the logger"
    (let [logger (log.impl/get-logger log/*logger-factory* *ns*)]
      (is (contains? (.getAppenders logger) "metabase-appender")
          "Logger does not contain `metabase-appender` logger")))
  (testing "logging adds to in-memory ringbuffer"
    (mt/with-log-level :warn
      (let [before (count (mb.logger/messages))]
        (log/warn "testing in-memory logger")
        (let [after (count (mb.logger/messages))]
          ;; it either increases (could have many logs from other tests) or it is the max capacity of the ring buffer
          (is (or (> after before)
                  (= before (var-get #'mb.logger/max-log-entries)))
              "In memory ring buffer did not receive log message")))))

  (testing "set isAdditive = false if parent logger is root to prevent logging to console (#26468)"
    (testing "make sure it's true to starts with"
      (is (true? (.isAdditive (log.impl/get-logger log/*logger-factory* 'metabase)))))

    (testing "set to false if parent logger is root"
      (mt/with-log-level :warn
        (is (false? (.isAdditive (log.impl/get-logger log/*logger-factory* 'metabase))))))

    (testing "still true if the parent logger is not root"
      (mt/with-log-level [metabase.logger :warn]
        (is (true? (.isAdditive (log.impl/get-logger log/*logger-factory* 'metabase.logger))))))))

(deftest logger-test
  (testing "Using log4j2 logger"
    (is (= (log.impl/name log/*logger-factory*)
           "org.apache.logging.log4j")
        "Not using log4j2 logger factory. This could add two orders of magnitude of time to logging calls")))
