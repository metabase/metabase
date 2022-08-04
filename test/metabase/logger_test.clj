(ns metabase.logger-test
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.test :refer :all]
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
  (testing "Installed custom logger"
    (is (str/includes? (log.impl/name log/*logger-factory*) "MetabaseLoggerFactory")
        "Custom `metabase.logger.MetabaseLoggerFactory` logger not installed"))
  (testing "memoizes loggers for namespaces"
    (log.impl/get-logger log/*logger-factory* *ns*)
    (is (contains? (memoize/snapshot (var-get #'mb.logger/ns-logger))
                   ;; memoization cache keeps the args vector
                   [*ns*])
        "Memoization cache does not include `*ns*`")))
