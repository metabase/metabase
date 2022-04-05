(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:require [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [clojure.tools.logging.impl :as log.impl]
            [metabase.test-runner.parallel :as test-runner.parallel]
            [potemkin :as p]
            [schema.core :as s])
  (:import java.io.PrintStream
           [org.apache.commons.io.output NullOutputStream NullWriter]
           [org.apache.logging.log4j Level LogManager]
           [org.apache.logging.log4j.core Appender LifeCycle LogEvent Logger LoggerContext]
           [org.apache.logging.log4j.core.config Configuration LoggerConfig]))

;; make sure [[clojure.tools.logging]] is using the Log4j2 factory, otherwise the swaps we attempt to do here don't seem
;; to work.
(when-not (= (log.impl/name log/*logger-factory*) "org.apache.logging.log4j")
  (alter-var-root #'log/*logger-factory* (constantly (log.impl/log4j2-factory)))
  (log/infof "Setting clojure.tools.logging factory to %s" `log.impl/log4j2-factory))

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

  DEPRECATED -- you don't need to do this anymore. Tests now have a default log level of `FATAL` which means error
  logging will be suppressed by default. This macro predates the current test logging levels. You can remove usages of
  this macro.

  If you want to suppress log messages for REPL usage you can use [[with-log-level]] instead."
  {:style/indent 0}
  [& body]
  `(do-with-suppressed-output (fn [] ~@body)))

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

(defn- logger-name ^String [a-namespace]
  (if (instance? clojure.lang.Namespace a-namespace)
    (recur (ns-name a-namespace))
    (name a-namespace)))

(defn- logger-context ^LoggerContext []
  (LogManager/getContext false))

(defn- configuration ^Configuration []
  (.getConfiguration (logger-context)))

(defn- effective-ns-logger
  "Get the logger that will be used for the namespace named by `a-namespace`."
  ^LoggerConfig [a-namespace]
  (assert (= (log.impl/name log/*logger-factory*) "org.apache.logging.log4j"))
  (let [^Logger logger (log.impl/get-logger log/*logger-factory* (logger-name a-namespace))]
    (.get logger)))

(s/defn ns-log-level :- LogLevelKeyword
  "Get the log level currently applied to the namespace named by symbol `a-namespace`. `a-namespace` may be a symbol
  that names an actual namespace, or a prefix such or `metabase` that applies to all 'sub' namespaces that start with
  `metabase.` (unless a more specific logger is defined for them).

    (mt/ns-log-level 'metabase.query-processor.middleware.cache) ; -> :info"
  [a-namespace]
  (log-level->keyword (.getLevel (effective-ns-logger a-namespace))))

(defn- exact-ns-logger
  "Get the logger defined for `a-namespace` if it is an exact match; otherwise `nil` if a 'parent' logger will be used."
  ^LoggerConfig [a-namespace]
  (let [logger (effective-ns-logger a-namespace)]
    (when (= (.getName logger) (logger-name a-namespace))
      logger)))

(defn- ensure-unique-logger!
  "Ensure that `a-namespace` has its own unique logger, e.g. it's not a parent logger like `metabase`. This way we can
  set the level for this namespace without affecting others."
  [a-namespace]
  {:post [(exact-ns-logger a-namespace)]}
  (when-not (exact-ns-logger a-namespace)
    (let [parent-logger (effective-ns-logger a-namespace)
          new-logger    (LoggerConfig/createLogger
                         (.isAdditive parent-logger)
                         (.getLevel parent-logger)
                         (logger-name a-namespace)
                         (str (.isIncludeLocation parent-logger))
                         ^"[Lorg.apache.logging.log4j.core.config.AppenderRef;"
                         (into-array org.apache.logging.log4j.core.config.AppenderRef (.getAppenderRefs parent-logger))
                         ^"[Lorg.apache.logging.log4j.core.config.Property;"
                         (into-array org.apache.logging.log4j.core.config.Property (.getPropertyList parent-logger))
                         (configuration)
                         (.getFilter parent-logger))]
      (.addLogger (configuration) (logger-name a-namespace) new-logger)
      (.updateLoggers (logger-context))
      (println "Created a new logger for" (logger-name a-namespace)))))

(s/defn set-ns-log-level!
  "Set the log level for the namespace named by `a-namespace`. Intended primarily for REPL usage; for tests,
  with [[with-log-messages-for-level]] instead. `a-namespace` may be a symbol that names an actual namespace, or can
  be a prefix such as `metabase` that applies to all 'sub' namespaces that start with `metabase.` (unless a more
  specific logger is defined for them).

    (mt/set-ns-log-level! 'metabase.query-processor.middleware.cache :debug)"
  ([new-level :- LogLevelKeyword]
   (set-ns-log-level! (ns-name *ns*) new-level))

  ([a-namespace new-level :- LogLevelKeyword]
   (ensure-unique-logger! a-namespace)
   (let [logger    (exact-ns-logger a-namespace)
         new-level (->Level new-level)]
     (.setLevel logger new-level)
     (.updateLoggers (logger-context)))))

(defn do-with-log-level [a-namespace level thunk]
  (test-runner.parallel/assert-test-is-not-parallel "with-log-level")
  (let [original-log-level (ns-log-level a-namespace)]
    (try
      (set-ns-log-level! a-namespace level)
      (thunk)
      (finally
        (set-ns-log-level! a-namespace original-log-level)))))

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


;;;; [[with-log-messages-for-level]]

(p/defprotocol+ ^:private IInMemoryAppender
  (^:private appender-logs [this]))

(p/defrecord+ ^:private InMemoryAppender [appender-name state]
  Appender
  (append [_this event]
    (let [event ^LogEvent event]
      (swap! state update :logs (fn [logs]
                                  (conj (vec logs)
                                        [(log-level->keyword (.getLevel event))
                                         (.getThrown event)
                                         (str (.getMessage event))
                                         #_(.getLoggerName event)]))))
    nil)
  (getHandler [_this]
    (:error-handler @state))
  (getLayout [_this])
  (getName [_this]
    appender-name)
  (ignoreExceptions [_this]
    true)
  (setHandler [_this new-handler]
    (swap! state assoc :error-handler new-handler))

  LifeCycle
  (getState [_this])
  (initialize [_this])
  (isStarted [_this]
    (not (:stopped @state)))
  (isStopped [_this]
    (boolean (:stopped @state)))
  (start [_this]
    (swap! state assoc :stopped false))
  (stop [_this]
    (swap! state assoc :stopped true))

  IInMemoryAppender
  (appender-logs [_this]
    (:logs @state)))

(defn do-with-log-messages-for-level [a-namespace level f]
  (test-runner.parallel/assert-test-is-not-parallel "with-log-messages-for-level")
  (ensure-unique-logger! a-namespace)
  (let [state         (atom nil)
        appender-name (format "%s-%s-%s" `InMemoryAppender (logger-name a-namespace) (name level))
        appender      (->InMemoryAppender appender-name state)
        logger        (exact-ns-logger a-namespace)]
    (try
      (.addAppender logger appender (->Level level) nil)
      (f (fn [] (appender-logs appender)))
      (finally
        (.removeAppender logger appender-name)))))

;; TODO -- this macro should probably just take a binding for the `logs` function so you can eval when needed
(defmacro with-log-messages-for-level
  "Executes `body` with the metabase logging level set to `level-kwd`. This is needed when the logging level is set at a
  higher threshold than the log messages you're wanting to example. As an example if the metabase logging level is set
  to `ERROR` in the log4j.properties file and you are looking for a `WARN` message, it won't show up in the
  `with-log-messages` call as there's a guard around the log invocation, if it's not enabled (it is set to `ERROR`)
  the log function will never be invoked. This macro will temporarily set the logging level to `level-kwd`, then
  invoke `with-log-messages`, then set the level back to what it was before the invocation. This allows testing log
  messages even if the threshold is higher than the message you are looking for."
  {:arglists '([level & body] [[a-namespace level] & body])}
  [ns+level & body]
  (let [[a-namespace level] (if (sequential? ns+level)
                              ns+level
                              ['metabase ns+level])
        a-namespace (if (symbol? a-namespace)
                      (list 'quote a-namespace)
                      a-namespace)]
    `(do-with-log-level
      ~a-namespace
      ~level
      (fn []
        (do-with-log-messages-for-level
         ~a-namespace
         ~level
         (fn [logs#]
           ~@body
           (logs#)))))))



;;;; tests

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
