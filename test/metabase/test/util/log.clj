(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u])
  (:import [org.apache.log4j Level Logger LogManager]
           [org.apache.commons.io.output NullOutputStream NullWriter]
           java.io.PrintStream))

(defn do-with-suppressed-output
  "Impl for `suppress-output` macro; don't use this directly."
  [f]
  ;; yes, swapping out *out*/*err*, swapping out System.out/System.err, and setting all the log levels to OFF is
  ;; really necessary to suppress everyting (!)
  (let [orig-out         (System/out)
        orig-err         (System/err)
        null-stream      (PrintStream. (NullOutputStream.))
        null-writer      (NullWriter.)
        loggers          (cons
                          (Logger/getRootLogger)
                          (enumeration-seq (LogManager/getCurrentLoggers)))
        logger+old-level (vec (for [^Logger logger loggers]
                                [logger (.getLevel logger)]))]
    (try
      (System/setOut null-stream)
      (System/setErr null-stream)
      (doseq [^Logger logger loggers]
        (.setLevel logger Level/OFF))
      (binding [*out* null-writer
                *err* null-writer]
        (f))
      (finally
        (System/setOut orig-out)
        (System/setErr orig-err)
        (.close null-stream)            ; not 100% sure this is necessary
        (.close null-writer)
        (doseq [[^Logger logger, ^Level old-level] logger+old-level]
          (.setLevel logger old-level))))))

(defmacro suppress-output
  "Execute `body` with all logging/`*out*`/`*err*` messages suppressed. Useful for avoiding cluttering up test output
  for tests with stacktraces and error messages from tests that are supposed to fail."
  {:style/indent 0}
  [& body]
  `(do-with-suppressed-output (fn [] ~@body)))
