(ns metabase.logger
  (:require [amalloy.ring-buffer :refer [ring-buffer]]
            [clj-time.coerce :as time.coerce]
            [clj-time.format :as time.format]
            [clojure.tools.logging :as log]
            [clojure.tools.logging.impl :as log.impl]
            [metabase.config :as config])
  (:import org.apache.commons.lang3.exception.ExceptionUtils
           [org.apache.logging.log4j Level Logger LogManager]
           [org.apache.logging.log4j.core Appender LogEvent LoggerContext]
           org.apache.logging.log4j.core.config.LoggerConfig))

(def ^:private ^:const max-log-entries 2500)

(defonce ^:private messages* (atom (ring-buffer max-log-entries)))

(defn messages
  "Get the list of currently buffered log entries, from most-recent to oldest."
  []
  (reverse (seq @messages*)))

(defn- event->log-data [^LogEvent event]
  {:timestamp    (time.format/unparse (time.format/formatter :date-time)
                                      (time.coerce/from-long (.getTimeMillis event)))
   :level        (.getLevel event)
   :fqns         (.getLoggerName event)
   :msg          (.getMessage event)
   :exception    (when-let [throwable (.getThrown event)]
                   (seq (ExceptionUtils/getStackFrames throwable)))
   :process_uuid config/local-process-uuid})

(defn- metabase-appender ^Appender []
  (let [^org.apache.logging.log4j.core.Filter filter                   nil
        ^org.apache.logging.log4j.core.Layout layout                   nil
        ^"[Lorg.apache.logging.log4j.core.config.Property;" properties nil]
    (proxy [org.apache.logging.log4j.core.appender.AbstractAppender]
        ["metabase-appender" filter layout false properties]
      (append [event]
        (swap! messages* conj (event->log-data event))
        nil))))

(defonce ^:private has-added-appender? (atom false))

(when-not *compile-files*
  (when-not @has-added-appender?
    (reset! has-added-appender? true)
    (let [^LoggerContext ctx                           (LogManager/getContext true)
          config                                       (.getConfiguration ctx)
          appender                                     (metabase-appender)
          ^org.apache.logging.log4j.Level level        nil
          ^org.apache.logging.log4j.core.Filter filter nil]
      (.start appender)
      (.addAppender config appender)
      (doseq [[_ ^LoggerConfig logger-config] (.getLoggers config)]
        (.addAppender logger-config appender level filter))
      (.updateLoggers ctx))))

;;; [[clojure.tools.logging]] should be using our custom Logging factory which performs NICELY and memoizes calls to
;;; `.getLogger` instead of fetching it every single time which is SLOW in Multi-Release JARs. See #16830

(defn- log-level-keyword->Level
  ^Level [level-keyword]
  (case level-keyword
    :trace Level/TRACE
    :debug Level/DEBUG
    :info  Level/INFO
    :warn  Level/WARN
    :error Level/ERROR
    :fatal Level/FATAL))

;;; Extend [[org.apache.logging.log4j.Logger]] so it works with [[clojure.tools.logging]].
;;;
;;; Yes, https://github.com/clojure/tools.logging/blob/master/src/main/clojure/clojure/tools/logging/impl.clj#L178-L208
;;; is presumably doing this already but it might not be a good idea to assume that code gets called. It seems like
;;; [[clojure.tools.logging] tries to use the SLF4J logging factory by default rather than the Log4j2 factory. If that
;;; happens then I think those lines don't get called at all. So better safe than sorry I guess.
(extend-protocol log.impl/Logger
  Logger
  (enabled? [^Logger this level-keyword]
    (.isEnabled this (log-level-keyword->Level level-keyword)))

  (write! [^Logger this level-keyword ^Throwable e ^Object message]
    (let [level (log-level-keyword->Level level-keyword)]
      (if e
        (.log this level message e)
        (.log this level message)))))

;;; presumably this is always called with a [[clojure.lang.Namespace]] but it's probably better to be flexible and handle
;;; symbols and strings as well in case anybody tries to do anything weird e.g. in [[metabase.test.util.log]]
(defn- ns-logger*
  "Unmemoized function for getting the appropriate [[Logger]] to use for a Clojure namespace."
  ^Logger [a-namespace]
  (if (string? a-namespace)
    (.getLogger (LogManager/getContext false) ^String a-namespace)
    (recur (name (ns-name a-namespace)))))

;;; Yes, the arglists metadata below is missing `:tag` but if I try to write something like
;;;
;;;    ^{:arglists `(^Logger [~'a-namespace])}
;;;
;;; or
;;;    ^{:arglists (list (vary-meta ['a-namespace] assoc :tag `Logger))}
;;;
;;; then Eastwood has a fit. We don't really need it anyway.
(def ^:private ^{:arglists '([a-namespace])} ns-logger
  "In prod, this is a memoized version of [[ns-logger*]]. Otherwise it's the same as [[ns-logger*]].

  The logger will never change for a given namespace in prod runs so memoizing slow calls to `.getLogger` can speed
  things up a lot. In non-prod [[metabase.test.util.log]] stuff can swap out loggers at runtime."
  (if config/is-prod?
    (memoize ns-logger*)
    ns-logger*))

(defrecord MetabaseLoggerFactory []
  log.impl/LoggerFactory
  (name [_this]
    "org.apache.logging.log4j")
  (get-logger [_this logger-ns]
    (ns-logger logger-ns)))

;; switch out the [[clojure.tools.logging]] logger factory with our custom better-performing version.
(alter-var-root #'log/*logger-factory* (constantly (->MetabaseLoggerFactory)))
(log/infof "Setting clojure.tools.logging factory to %s" `MetabaseLoggerFactory)
