(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:import java.io.PrintStream
           [org.apache.commons.io.output NullOutputStream NullWriter]
           [org.apache.log4j Level Logger LogManager]))

(def ^:private logger->original-level
  (let [loggers (cons
                 (Logger/getRootLogger)
                 (enumeration-seq (LogManager/getCurrentLoggers)))]
    (into {} (for [^Logger logger loggers]
               [logger (.getLevel logger)]))))

(def ^:private ^:dynamic *suppressed* false)

(defn do-with-suppressed-output
  "Impl for `suppress-output` macro; don't use this directly."
  [f]
  (if *suppressed*
    (f)
    (binding [*suppressed* true]
      ;; yes, swapping out *out*/*err*, swapping out System.out/System.err, and setting all the log levels to OFF is
      ;; really necessary to suppress everyting (!)
      (let [orig-out (System/out)
            orig-err (System/err)]
        (with-open [null-stream (PrintStream. (NullOutputStream.))
                    null-writer (NullWriter.)]
          (try
            (System/setOut null-stream)
            (System/setErr null-stream)
            (doseq [[^Logger logger] logger->original-level]
              (.setLevel logger Level/OFF))
            (binding [*out* null-writer
                      *err* null-writer]
              (f))
            (finally
              (System/setOut orig-out)
              (System/setErr orig-err)
              (doseq [[^Logger logger, ^Level old-level] logger->original-level]
                (.setLevel logger old-level)))))))))

(defmacro suppress-output
  "Execute `body` with all logging/`*out*`/`*err*` messages suppressed. Useful for avoiding cluttering up test output
  for tests with stacktraces and error messages from tests that are supposed to fail."
  {:style/indent 0}
  [& body]
  `(do-with-suppressed-output (fn [] ~@body)))
