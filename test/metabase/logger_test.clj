(ns metabase.logger-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging :as log]
   [clojure.tools.logging.impl :as log.impl]
   [metabase.logger :as logger]
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
                (logger/messages))
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
                   (logger/messages))))))

(deftest fork-logs-test
  (testing "logger/for-ns works properly"
    (let [f (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))]
      (try
        (with-open [_ (logger/for-ns f 'metabase.logger-test {:additive false})]
          (log/info "just a test"))
        (is (=? [#".*just a test$"]
                (line-seq (io/reader f))))
        (finally
          (when (.exists f)
            (io/delete-file f)))))
    (let [baos (java.io.ByteArrayOutputStream.)]
      (with-open [_ (logger/for-ns baos 'metabase.logger-test {:additive false})]
        (log/info "just a test"))
      (log/info "this line is not going into our stream")
      (testing "We catched the line we needed and did not catch the other one"
        (is (=? [#".*just a test$"]
                (line-seq (io/reader (.toByteArray baos))))))))

  (testing "We can capture few separate namespaces"
    (let [f (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))]
      (try
        (with-open [_ (logger/for-ns f ['metabase.logger-test
                                        'metabase.unknown]
                                     {:additive false})]
          (log/info "just a test")
          (log/log 'metabase.unknown :info nil "separate test")
          (testing "Check that `for-ns` will skip non-specified namespaces"
            (log/log 'metabase.unknown2 :info nil "this one going into standard log")))
        (is (=? [#".*just a test$"
                 #".*separate test$"]
                (line-seq (io/reader f))))
        (finally
          (when (.exists f)
            (io/delete-file f)))))))
