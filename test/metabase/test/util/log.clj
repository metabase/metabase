(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:require
   [clojure.test :refer :all]
   [mb.hawk.parallel]
   [metabase.logger :as logger]
   [metabase.util.namespaces :as shared.ns]))

(set! *warn-on-reflection* true)

(shared.ns/import-fns
 [logger
  ns-log-level
  set-ns-log-level!])

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn do-with-log-level [a-namespace level thunk]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-log-level")
  (logger/ensure-unique-logger! a-namespace)
  (let [original-log-level (logger/ns-log-level a-namespace)
        logger             (logger/exact-ns-logger a-namespace)
        is-additive        (.isAdditive logger)
        parent-is-root?    (= "" (-> logger .getParent .getName))]
    (try
      ;; prevent events to be passed to the root logger's appenders which will log to the Console
      ;; https://logging.apache.org/log4j/2.x/manual/configuration.html#Additivity
      (when parent-is-root?
        (.setAdditive logger false))
      (logger/set-ns-log-level! a-namespace level)
      (thunk)
      (finally
        (when parent-is-root?
          (.setAdditive logger is-additive))
        (logger/set-ns-log-level! a-namespace original-log-level)))))

(defmacro with-log-level
  "Sets the log level (e.g. `:debug` or `:trace`) while executing `body`. Not thread safe! But good for debugging from
  the REPL or for tests.

    (with-log-level :debug
      (do-something))

  You can optionally change the level for only some namespaces. Pass in a pair of `[namespace level]` to change the
  log level for a namespace and any sub-namespaces (e.g., passing `metabase` will change the log levels for all
  namespaces starting with `metabase.`:

    (with-log-level [metabase.query-processor :debug]
      ...)"
  {:arglists '([level & body]
               [[namespace level] & body])}
  [ns+level & body]
  (let [[a-namespace level] (if (sequential? ns+level)
                              ns+level
                              ['metabase ns+level])
        a-namespace         (if (symbol? a-namespace)
                              (list 'quote a-namespace)
                              a-namespace)]
    `(do-with-log-level ~a-namespace ~level (fn [] ~@body))))

;;;; tests

(deftest set-ns-log-level!-test
  (let [original-mb-log-level (logger/ns-log-level 'metabase)]
    (testing "Should be falling back to the root-level MB logger initially"
      (is (= (logger/effective-ns-logger 'metabase)
             (logger/effective-ns-logger 'metabase.test.util.log.fake))))
    (testing "Should be able to set log level for a namespace"
      (logger/set-ns-log-level! 'metabase.test.util.log.fake :debug)
      (is (= :debug
             (logger/ns-log-level 'metabase.test.util.log.fake))))
    (testing "Should not affect parent loggers"
      (is (= original-mb-log-level
             (logger/ns-log-level 'metabase))))))
