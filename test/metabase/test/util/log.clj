(ns metabase.test.util.log
  "Utils for controlling the logging that goes on when running tests."
  (:require
   [clojure.test :refer :all]
   [mb.hawk.parallel]
   [metabase.logger :as logger]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.apache.logging.log4j Level)
   (org.apache.logging.log4j.core Appender)
   (org.apache.logging.log4j.core.config LoggerConfig)))

(set! *warn-on-reflection* true)

(def ^:private keyword->Level
  {:off   Level/OFF
   :fatal Level/FATAL
   :error Level/ERROR
   :warn  Level/WARN
   :info  Level/INFO
   :debug Level/DEBUG
   :trace Level/TRACE})

(def ^:private LogLevelKeyword
  (into [:enum] (keys keyword->Level)))

(defn- ->Level
  "Conversion from a keyword log level to the Log4J constance mapped to that log level. Not intended for use outside of
  the [[with-log-messages-for-level]] macro."
  ^Level [k]
  (or (when (instance? Level k)
        k)
      (get keyword->Level (keyword k))
      (throw (ex-info "Invalid log level" {:level k}))))

(mu/defn- log-level->keyword :- LogLevelKeyword
  [level :- (ms/InstanceOfClass Level)]
  (some (fn [[k a-level]]
          (when (= a-level level)
            k))
        keyword->Level))

(mu/defn ns-log-level :- LogLevelKeyword
  "Get the log level currently applied to the namespace named by symbol `a-namespace`. `a-namespace` may be a symbol
  that names an actual namespace, or a prefix such or `metabase` that applies to all 'sub' namespaces that start with
  `metabase.` (unless a more specific logger is defined for them).

    (mt/ns-log-level 'metabase.query-processor.middleware.cache) ; -> :info"
  [a-namespace]
  (log-level->keyword (.getLevel (logger/effective-ns-logger a-namespace))))

(defn- exact-ns-logger
  "Get the logger defined for `a-namespace` if it is an exact match; otherwise `nil` if a 'parent' logger will be used."
  ^LoggerConfig [a-namespace]
  (let [logger (logger/effective-ns-logger a-namespace)]
    (when (= (.getName logger) (logger/logger-name a-namespace))
      logger)))

(defn- ensure-unique-logger!
  "Ensure that `a-namespace` has its own unique logger, e.g. it's not a parent logger like `metabase`. This way we can
  set the level for this namespace without affecting others."
  [a-namespace]
  {:post [(exact-ns-logger a-namespace)]}
  (when-not (exact-ns-logger a-namespace)
    (let [parent-logger (logger/effective-ns-logger a-namespace)
          new-logger    (LoggerConfig/createLogger
                         (.isAdditive parent-logger)
                         (.getLevel parent-logger)
                         (logger/logger-name a-namespace)
                         (str (.isIncludeLocation parent-logger))
                         ^"[Lorg.apache.logging.log4j.core.config.AppenderRef;"
                         (into-array org.apache.logging.log4j.core.config.AppenderRef (.getAppenderRefs parent-logger))
                         ^"[Lorg.apache.logging.log4j.core.config.Property;"
                         (into-array org.apache.logging.log4j.core.config.Property (.getPropertyList parent-logger))
                         (logger/configuration)
                         (.getFilter parent-logger))]
      ;; copy the appenders from the parent logger, e.g. the [[metabase.logger/metabase-appender]]
      (doseq [[_name ^Appender appender] (.getAppenders parent-logger)]
        (.addAppender new-logger appender (.getLevel new-logger) (.getFilter new-logger)))
      (.addLogger (logger/configuration) (logger/logger-name a-namespace) new-logger)
      (.updateLoggers (logger/context))
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println "Created a new logger for" (logger/logger-name a-namespace)))))

(mu/defn set-ns-log-level!
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
     ;; it seems like changing the level doesn't update the level for the appenders
     ;; e.g. [[metabase.logger/metabase-appender]], so if we want the new level to be reflected there the only way I can
     ;; figure out to make it work is to remove the appender and then add it back with the updated level. See JavaDoc
     ;; https://logging.apache.org/log4j/2.x/log4j-core/apidocs/org/apache/logging/log4j/core/config/LoggerConfig.html
     ;; for more info. There's probably a better way to do this, but I don't know what it is. -- Cam
     (doseq [[^String appender-name ^Appender appender] (.getAppenders logger)]
       (.removeAppender logger appender-name)
       (.addAppender logger appender new-level (.getFilter logger)))
     (.updateLoggers (logger/context)))))

(defn do-with-log-level [a-namespace level thunk]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-log-level")
  (ensure-unique-logger! a-namespace)
  (let [original-log-level (ns-log-level a-namespace)
        logger             (exact-ns-logger a-namespace)
        is-additive        (.isAdditive logger)
        parent-is-root?    (= "" (-> logger .getParent .getName))]
    (try
      ;; prevent events to be passed to the root logger's appenders which will log to the Console
      ;; https://logging.apache.org/log4j/2.x/manual/configuration.html#Additivity
      (when parent-is-root?
        (.setAdditive logger false))
      (set-ns-log-level! a-namespace level)
      (thunk)
      (finally
        (when parent-is-root?
          (.setAdditive logger is-additive))
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

;;;; tests

(deftest set-ns-log-level!-test
  (let [original-mb-log-level (ns-log-level 'metabase)]
    (testing "Should be falling back to the root-level MB logger initially"
      (is (= (logger/effective-ns-logger 'metabase)
             (logger/effective-ns-logger 'metabase.test.util.log.fake))))
    (testing "Should be able to set log level for a namespace"
      (set-ns-log-level! 'metabase.test.util.log.fake :debug)
      (is (= :debug
             (ns-log-level 'metabase.test.util.log.fake))))
    (testing "Should not affect parent loggers"
      (is (= original-mb-log-level
             (ns-log-level 'metabase))))))
