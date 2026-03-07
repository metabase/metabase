(ns metabase.logger.core
  "Configures the logger system for Metabase. Sets up an in-memory logger in a ring buffer for showing in the UI. Other
  logging options are set in [[metabase.core.bootstrap]]: the context locator for log4j2 and ensuring log4j2 is the
  logger that clojure.tools.logging uses."
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging :as log]
   [clojure.tools.logging.impl :as log.impl]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config])
  (:import
   (java.lang AutoCloseable)
   (java.util Queue)
   (org.apache.commons.collections4 QueueUtils)
   (org.apache.commons.collections4.queue CircularFifoQueue)
   (org.apache.commons.lang3.exception ExceptionUtils)
   (org.apache.logging.log4j LogManager Level)
   (org.apache.logging.log4j.core Appender LogEvent Logger LoggerContext)
   (org.apache.logging.log4j.core.appender AbstractAppender FileAppender OutputStreamAppender)
   (org.apache.logging.log4j.core.config AbstractConfiguration Configuration LoggerConfig)))

(set! *warn-on-reflection* true)

(def ^:private ^:const max-log-entries 250)

(defonce ^:private ^Queue messages* (QueueUtils/synchronizedQueue (CircularFifoQueue. (int max-log-entries))))

(defn messages
  "Get the list of currently buffered log entries, from most-recent to oldest."
  []
  (locking messages*
    (rseq (vec messages*))))

(defn- elide-string
  "Elides the string to the specified length, adding '...' if it exceeds that length."
  [s max-length]
  (if (> (count s) max-length)
    (str (subs s 0 (- max-length 3)) "...")
    s))

(defn- event->log-data [^LogEvent event]
  {:timestamp    (t/format :iso-instant (t/instant (.getTimeMillis event)))
   :level        (.getLevel event)
   :fqns         (.getLoggerName event)
   :msg          (elide-string (str (.getMessage event)) 4000)
   :exception    (when-let [throwable (.getThrown event)]
                   (take 20 (map #(elide-string (str %) 500) (seq (ExceptionUtils/getStackFrames throwable)))))
   :process_uuid config/local-process-uuid})

(defn- metabase-appender ^Appender []
  (let [^org.apache.logging.log4j.core.Filter filter                   nil
        ^org.apache.logging.log4j.core.Layout layout                   nil
        ^"[Lorg.apache.logging.log4j.core.config.Property;" properties nil]
    (proxy [org.apache.logging.log4j.core.appender.AbstractAppender]
           ["metabase-appender" filter layout false properties]
      (append [event]
        (.add messages* (event->log-data event))
        nil))))

(defonce ^:private has-added-appender? (atom false))

(defn- context
  "Get global logging context."
  ^LoggerContext []
  (LogManager/getContext (classloader/the-classloader) false))

(defn- configuration
  "Get global logging configuration"
  ^Configuration []
  (.getConfiguration (context)))

(when-not *compile-files*
  (when-not @has-added-appender?
    (reset! has-added-appender? true)
    (let [appender (metabase-appender)
          config      (configuration)]
      (.start appender)
      (.addAppender config appender)
      (doseq [[_ ^LoggerConfig logger-config] (.getLoggers config)]
        (.addAppender logger-config appender (.getLevel logger-config) (.getFilter logger-config))
        (.updateLoggers (context))))))

;;; Custom loggers

(defn- logger-name
  "Get string name from symbol or ns"
  ^String [a-namespace]
  (if (instance? clojure.lang.Namespace a-namespace)
    (name (ns-name a-namespace))
    (name a-namespace)))

(def ^:private keyword->Level
  "Mapping from the log level keywords to the log level objects. The order is from least verbose to most verbose."
  (ordered-map/ordered-map
   :off   Level/OFF
   :fatal Level/FATAL
   :error Level/ERROR
   :warn  Level/WARN
   :info  Level/INFO
   :debug Level/DEBUG
   :trace Level/TRACE))

(def levels
  "The valid log levels, from least verbose to most verbose."
  (keys keyword->Level))

(defn- ->Level
  "Conversion from a keyword log level to the Log4J constance mapped to that log level. Not intended for use outside of
  the [[with-log-messages-for-level]] macro."
  ^Level [k]
  (or (when (instance? Level k)
        k)
      (get keyword->Level (keyword k))
      (throw (ex-info "Invalid log level" {:level k}))))

(defn- log-level->keyword
  [^Level level]
  (some (fn [[k a-level]]
          (when (= a-level level)
            k))
        keyword->Level))

(defn level-enabled?
  "Is logging at `level` enabled for `a-namespace`? `level` may be a keyword (e.g. `:debug`)
  or an org.apache.logging.log4j.Level."
  (^Boolean [level]
   (level-enabled? *ns* level))
  (^Boolean [a-namespace level]
   (let [^Logger logger (log.impl/get-logger log/*logger-factory* a-namespace)
         ^Level level  (->Level level)]
     (.isEnabled logger level))))

(defn effective-ns-logger
  "Get the logger that will be used for the namespace named by `a-namespace`."
  ^LoggerConfig [a-namespace]
  (let [^Logger logger (log.impl/get-logger log/*logger-factory* a-namespace)]
    (.get logger)))

(defn- find-logger-layout
  "Find any logger with a specified layout."
  [^LoggerConfig logger]
  (when logger
    (or (first (keep #(.getLayout ^AbstractAppender (val %)) (.getAppenders logger)))
        (recur (.getParent logger)))))

(defprotocol ^:private MakeAppender
  (^:private make-appender ^AbstractAppender [out layout]))

(extend-protocol MakeAppender
  java.io.File
  (make-appender [^java.io.File out layout]
    (.build
     (doto (FileAppender/newBuilder)
       (.setName "shared-appender-file")
       (.setLayout layout)
       (.withFileName (.getPath out)))))

  java.io.OutputStream
  (make-appender [^java.io.OutputStream out layout]
    (.build
     (doto (OutputStreamAppender/newBuilder)
       (.setName "shared-appender-os")
       (.setLayout layout)
       (.setTarget out)))))

(defn- add-ns-logger!
  "Add a logger for a given namespace to the configuration."
  [ns appender level additive]
  (let [logger-name (str ns)
        ns-logger   (LoggerConfig. logger-name level additive)]
    (.addAppender ns-logger appender level nil)
    (doto (configuration)
      ;; remove any existing loggers with this name
      (.removeLogger logger-name)
      (.addLogger logger-name ns-logger))
    ns-logger))

;;; TODO -- we should deprecated this and use a version of [[metabase.util.log.capture]] instead for this purpose.
(defn for-ns
  "Create separate logger for a given namespace(s) to fork out some logs."
  ^AutoCloseable [out nses & [{:keys [additive level]
                               :or   {additive true
                                      level    Level/INFO}}]]
  (let [nses     (if (vector? nses) nses [nses])
        config   (configuration)
        parents  (mapv effective-ns-logger nses)
        appender (make-appender out (find-logger-layout (first parents)))
        loggers  (vec (for [ns nses]
                        (add-ns-logger! ns appender level additive)))]
    (.start appender)
    (.addAppender config appender)

    (.updateLoggers (context))

    (reify AutoCloseable
      (close [_]
        (let [^AbstractConfiguration config (configuration)]
          (doseq [^LoggerConfig logger loggers]
            (.removeLogger config (.getName logger)))
          (.stop appender)
          ;; this method is only present in AbstractConfiguration
          (.removeAppender config (.getName appender))
          (.updateLoggers (context)))))))

(defn ns-log-level
  "Get the log level currently applied to the namespace named by symbol `a-namespace`. `a-namespace` may be a symbol
  that names an actual namespace, or a prefix such or `metabase` that applies to all 'sub' namespaces that start with
  `metabase.` (unless a more specific logger is defined for them).

    (mt/ns-log-level 'metabase.query-processor.middleware.cache) ; -> :info"
  [a-namespace]
  (log-level->keyword (.getLevel (effective-ns-logger a-namespace))))

(defn exact-ns-logger
  "Get the logger defined for `a-namespace` if it is an exact match; otherwise `nil` if a 'parent' logger will be used."
  ^LoggerConfig [a-namespace]
  (let [logger (effective-ns-logger a-namespace)]
    (when (= (.getName logger) (logger-name a-namespace))
      logger)))

(defn ensure-unique-logger!
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
      ;; copy the appenders from the parent logger, e.g. the [[metabase.logger/metabase-appender]]
      (doseq [[_name ^Appender appender] (.getAppenders parent-logger)]
        (.addAppender new-logger appender (.getLevel new-logger) (.getFilter new-logger)))
      (.addLogger (configuration) (logger-name a-namespace) new-logger)
      (.updateLoggers (context))
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println "Created a new logger for" (logger-name a-namespace)))))

(defn set-ns-log-level!
  "Set the log level for the namespace named by `a-namespace`. For REPL usage and for tests
  use [[metabase.test.util.log/with-log-messages-for-level]] instead.
  `a-namespace` may be a symbol that names an actual namespace, or can be a prefix such as `metabase` that applies
  to all 'sub' namespaces that start with `metabase.` (unless a more specific logger is defined for them).

    (logger/set-ns-log-level! 'metabase.query-processor.middleware.cache :debug)"
  ([new-level]
   (set-ns-log-level! (ns-name *ns*) new-level))

  ([a-namespace new-level]
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
     (.updateLoggers
      (context)))))

(defn remove-ns-logger!
  "Remove the logger for the namespace named by `a-namespace`."
  [a-namespace]
  (when-let [logger (exact-ns-logger a-namespace)]
    ;; in a normal world, this should happen automatically, but it shouldn't hurt removing the appenders explicitly
    (doseq [^String appender-name (keys (.getAppenders logger))]
      (.removeAppender logger appender-name))
    (.removeLogger (configuration) a-namespace)
    (.updateLoggers
     (context))))
