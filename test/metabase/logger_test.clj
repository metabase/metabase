(ns metabase.logger-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging :as log]
   [clojure.tools.logging.impl :as log.impl]
   [metabase.logger :as mb.logger]
   [metabase.test :as mt])
  (:import
   (org.apache.logging.log4j.core Logger)))

(set! *warn-on-reflection* true)

(defn logger
  (^Logger []
   (logger 'metabase.logger-test))
  (^Logger [ns-symb]
   (log.impl/get-logger log/*logger-factory* ns-symb)))

(deftest added-appender-tests
  (testing "appender is added to the logger"
    (is (contains? (.getAppenders (logger)) "metabase-appender")
        "Logger does not contain `metabase-appender` logger"))
  (testing "logging adds to in-memory ringbuffer"
    (mt/with-log-level :debug
      (log/debug "testing in-memory logger")
      (is (some (fn [{message :msg, :as entry}]
                  (when (str/includes? (str message) "testing in-memory logger")
                    entry))
                (mb.logger/messages))
          "In memory ring buffer did not receive log message")))

  (testing "set isAdditive = false if parent logger is root to prevent logging to console (#26468)"
    (testing "make sure it's true to starts with"
      (is (.isAdditive (logger 'metabase))))

    (testing "set to false if parent logger is root"
      (mt/with-log-level :warn
        (is (not (.isAdditive (logger 'metabase))))))

    (testing "still true if the parent logger is not root"
      (mt/with-log-level [metabase.logger :warn]
        (is (.isAdditive (logger 'metabase.logger)))))))

(deftest ^:parallel logger-test
  (testing "Using log4j2 logger"
    (is (= "org.apache.logging.log4j"
           (log.impl/name log/*logger-factory*))
        "Not using log4j2 logger factory. This could add two orders of magnitude of time to logging calls")))

(deftest logger-respect-configured-log-level-test
  (testing "The appender that we programmatically added should respect the log levels in the config file"
    ;; whether we're in the REPL or in test mode this should not show up
    (log/debug "THIS SHOULD NOT SHOW UP")
    (is (not (some (fn [{message :msg, :as entry}]
                     (when (str/includes? (str message) "THIS SHOULD NOT SHOW UP")
                       entry))
                   (mb.logger/messages))))))
