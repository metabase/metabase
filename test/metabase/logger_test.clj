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
      (log/warn "testing in-memory logger")
      (is (pos? (count (mb.logger/messages)))))))

(deftest memoized-logger-test
  (testing "Using log4j2 logger"
    (is (= (log.impl/name log/*logger-factory*)
           "org.apache.logging.log4j")
        "Not using log4j2 logger factory. This could add two orders of magnitude of time to logging calls")))
