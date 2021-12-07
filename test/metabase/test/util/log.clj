(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:require [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [metabase.test-runner.parallel :as test-runner.parallel]
            [schema.core :as s])
  (:import java.io.PrintStream
           [org.apache.commons.io.output NullOutputStream NullWriter]
           [org.apache.logging.log4j Level LogManager]
           [org.apache.logging.log4j.core Logger LoggerContext]
           [org.apache.logging.log4j.core.config Configuration LoggerConfig]))

(def ^:private ^:deprecated logger->original-level
  (delay
    (let [loggers (.getLoggers ^LoggerContext (LogManager/getContext false))]
      (into {} (for [^Logger logger loggers]
                 [logger (.getLevel logger)])))))

(def ^:private ^:dynamic *suppressed* false)

(defn ^:deprecated do-with-suppressed-output
  "Impl for [[suppress-output]] macro; don't use this directly."
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

(defmacro ^:deprecated suppress-output
  "Execute `body` with all logging/`*out*`/`*err*` messages suppressed. Useful for avoiding cluttering up test output
  for tests with stacktraces and error messages from tests that are supposed to fail.

  DEPRECATED -- you don't need to do this anymore. Tests now have a default log level of `CRITICAL` which means error
  logging will be suppressed by default. This macro predates the current test logging levels. You can remove usages of
  this macro."
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

(def ^:private keyword->Level
  {:off   Level/OFF
   :fatal Level/FATAL
   :error Level/ERROR
   :warn  Level/WARN
   :info  Level/INFO
   :debug Level/DEBUG
   :trace Level/TRACE})

(def ^:private LogLevelKeyword
  (apply s/enum (keys keyword->Level)))

(defn- ->Level
  "Conversion from a keyword log level to the Log4J constance mapped to that log level. Not intended for use outside of
  the [[with-log-messages-for-level]] macro."
  ^Level [k]
  (or (when (instance? Level k)
        k)
      (get keyword->Level (keyword k))
      (throw (ex-info "Invalid log level" {:level k}))))

(s/defn ^:private log-level->keyword :- LogLevelKeyword
  [level :- Level]
  (some (fn [[k a-level]]
          (when (= a-level level)
            k))
        keyword->Level))

(defn- logger-context ^LoggerContext []
  (LogManager/getContext true))

(defn- configuration ^Configuration []
  (.getConfiguration (logger-context)))

(defn- effective-ns-logger
  "Get the logger that will be used for the namespace named by `ns-symb`."
  ^LoggerConfig [ns-symb]
  {:pre [(symbol? ns-symb)]}
  (.getLoggerConfig (configuration) (name ns-symb)))

(s/defn ns-log-level :- LogLevelKeyword
  "Get the log level currently applied to the namespace named by symbol `ns-symb`. `ns-symb` may be a symbol that names
  an actual namespace, or a prefix such or `metabase` that applies to all 'sub' namespaces that start with
  `metabase.` (unless a more specific logger is defined for them).

    (mt/ns-log-level 'metabase.query-processor.middleware.cache) ; -> :info"
  [ns-symb]
  (log-level->keyword (.getLevel (effective-ns-logger ns-symb))))

(defn- logger-name
  ^String [^LoggerConfig logger]
  (.getName logger))

(defn- exact-ns-logger
  "Get the logger defined for `ns-symb` if it is an exact match; otherwise `nil` if a 'parent' logger will be used."
  ^LoggerConfig [ns-symb]
  (let [logger (effective-ns-logger ns-symb)]
    (when (= (logger-name logger) (name ns-symb))
      logger)))

(defn- get-or-create-ns-logger!
  "Get the logger currently used for `ns-symb`. If this logger is a parent logger, create a new logger specifically for
  this namespace and return that."
  ^LoggerConfig [ns-symb]
  (or (exact-ns-logger ns-symb)
      (let [parent-logger (effective-ns-logger ns-symb)
            new-logger    (LoggerConfig/createLogger
                           (.isAdditive parent-logger)
                           (.getLevel parent-logger)
                           (name ns-symb)
                           (str (.isIncludeLocation parent-logger))
                           ^"[Lorg.apache.logging.log4j.core.config.AppenderRef;"
                           (into-array org.apache.logging.log4j.core.config.AppenderRef (.getAppenderRefs parent-logger))
                           ^"[Lorg.apache.logging.log4j.core.config.Property;"
                           (into-array org.apache.logging.log4j.core.config.Property (.getPropertyList parent-logger))
                           (configuration)
                           (.getFilter parent-logger))]
        (.addLogger (configuration) (name ns-symb) new-logger)
        (println "Created a new logger for" ns-symb)
        new-logger)))

(defn- logger-info [^LoggerConfig logger]
  {:additive?         (.isAdditive logger)
   :include-location? (.isIncludeLocation logger)
   :level             (log-level->keyword (.getLevel logger))
   :name              (.getName logger)
   :properties        (.getProperties logger)})

(s/defn set-ns-log-level!
  "Set the log level for the namespace named by `ns-symb`. Intended primarily for REPL usage; for tests,
  with [[with-log-messages-for-level]] instead. `ns-symb` may be a symbol that names an actual namespace, or can be a
  prefix such as `metabase` that applies to all 'sub' namespaces that start with `metabase.` (unless a more specific
  logger is defined for them).

    (mt/set-ns-log-level! 'metabase.query-processor.middleware.cache :debug)"
  ([new-level :- LogLevelKeyword]
   (set-ns-log-level! (ns-name *ns*) new-level))

  ([ns-symb new-level :- LogLevelKeyword]
   (let [logger    (get-or-create-ns-logger! ns-symb)
         new-level (->Level new-level)]
     (.setLevel logger new-level)
     (.updateLoggers (logger-context)))))

(defn do-with-log-messages-for-level [x thunk]
  (test-runner.parallel/assert-test-is-not-parallel "with-log-level")
  (let [[ns-symb level] (if (sequential? x)
                          x
                          ['metabase x])
        old-level       (ns-log-level ns-symb)]
    (try
      (set-ns-log-level! ns-symb level)
      (thunk)
      (finally
        (set-ns-log-level! ns-symb old-level)))))

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
  [level & body]
  `(do-with-log-messages-for-level ~(if (sequential? level)
                                      `(quote ~level)
                                      level)
                                   (fn [] ~@body)))

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

(deftest set-ns-log-level!-test
  (let [original-mb-log-level (ns-log-level 'metabase)]
    (testing "Should be falling back to the root-level MB logger initially"
      (is (= (effective-ns-logger 'metabase)
             (effective-ns-logger 'metabase.test.util.log.fake))))
    (testing "Should be able to set log level for a namespace"
      (set-ns-log-level! 'metabase.test.util.log.fake :debug)
      (is (= :debug
             (ns-log-level 'metabase.test.util.log.fake))))
    (testing "Should not affect parent loggers"
      (is (= original-mb-log-level
             (ns-log-level 'metabase))))))
