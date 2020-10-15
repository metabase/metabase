(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:require [clojure.tools.logging :as log])
  (:import java.io.PrintStream
           [org.apache.commons.io.output NullOutputStream NullWriter]
           [org.apache.logging.log4j Level LogManager]
           [org.apache.logging.log4j.core Logger LoggerContext]))

(def ^:private logger->original-level
  (delay
    (let [loggers (.getLoggers ^LoggerContext (LogManager/getContext false))]
      (into {} (for [^Logger logger loggers]
                 [logger (.getLevel logger)])))))

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
            (doseq [[^Logger logger] @logger->original-level]
              (.setLevel logger Level/OFF))
            (binding [*out* null-writer
                      *err* null-writer]
              (f))
            (finally
              (System/setOut orig-out)
              (System/setErr orig-err)
              (doseq [[^Logger logger, ^Level old-level] @logger->original-level]
                (.setLevel logger old-level)))))))))

(defmacro suppress-output
  "Execute `body` with all logging/`*out*`/`*err*` messages suppressed. Useful for avoiding cluttering up test output
  for tests with stacktraces and error messages from tests that are supposed to fail."
  {:style/indent 0}
  [& body]
  `(do-with-suppressed-output (fn [] ~@body)))

(defn do-with-log-messages [f]
  (let [messages (atom [])]
    (with-redefs [log/log* (fn [_ & message]
                             (swap! messages conj (vec message)))]
      (f))
    @messages))

(defmacro with-log-messages
  "Execute `body`, and return a vector of all messages logged using the `log/` family of functions. Messages are of the
  format `[:level throwable message]`, and are returned in chronological order from oldest to newest.

     (with-log-messages (log/warn \"WOW\")) ; -> [[:warn nil \"WOW\"]]"
  {:style/indent 0}
  [& body]
  `(do-with-log-messages (fn [] ~@body)))

(def ^:private level-kwd->level
  "Conversion from a keyword log level to the Log4J constance mapped to that log level.
   Not intended for use outside of the `with-log-messages-for-level` macro."
  {:error Level/ERROR
   :warn  Level/WARN
   :info  Level/INFO
   :debug Level/DEBUG
   :trace Level/TRACE})

(defn do-with-log-messages-for-level [level thunk]
  (let [new-level (or (get level-kwd->level (keyword level))
                      (throw (ex-info "Invalid log level" {:level level})))
        ctx       ^LoggerContext (LogManager/getContext true)
        cfg       (.getConfiguration ctx)
        mb-logger (.getLoggerConfig cfg "metabase")
        old-level (.getLevel mb-logger)]
    (try
      (.setLevel mb-logger new-level)
      (.updateLoggers ctx)
      (thunk)
      (finally
        (.setLevel mb-logger old-level)
        (.updateLoggers ctx)))))

(defmacro with-log-level
  "Sets the log level (e.g. `:debug` or `:trace`) while executing `body`. Not thread safe! But good for debugging from
  the REPL or for tests.

    (with-log-level :debug
      (do-something))"
  [level & body]
  `(do-with-log-messages-for-level ~level (fn [] ~@body)))

(defmacro with-log-messages-for-level
  "Executes `body` with the metabase logging level set to `level-kwd`. This is needed when the logging level is set at a
  higher threshold than the log messages you're wanting to example. As an example if the metabase logging level is set
  to `ERROR` in the log4j.properties file and you are looking for a `WARN` message, it won't show up in the
  `with-log-messages` call as there's a guard around the log invocation, if it's not enabled (it is set to `ERROR`)
  the log function will never be invoked. This macro will temporarily set the logging level to `level-kwd`, then
  invoke `with-log-messages`, then set the level back to what it was before the invocation. This allows testing log
  messages even if the threshold is higher than the message you are looking for."
  [level-kwd & body]
  `(with-log-level ~level-kwd
     (with-log-messages
       ~@body)))
