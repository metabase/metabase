(ns metabase.logger
  "Configures the logger system for Metabase. Sets up an in-memory logger in a ring buffer for showing in the UI. Other
  logging options are set in [[metabase.bootstrap]]: the context locator for log4j2 and ensuring log4j2 is the logger
  that clojure.tools.logging uses."
  (:require
   [amalloy.ring-buffer :refer [ring-buffer]]
   [clj-time.coerce :as time.coerce]
   [clj-time.format :as time.format]
   [metabase.config :as config]
   [metabase.plugins.classloader :as classloader])
  (:import
   (org.apache.commons.lang3.exception ExceptionUtils)
   (org.apache.logging.log4j LogManager)
   (org.apache.logging.log4j.core Appender LogEvent LoggerContext)
   (org.apache.logging.log4j.core.config LoggerConfig)))

(set! *warn-on-reflection* true)

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
    (let [^LoggerContext ctx (LogManager/getContext (classloader/the-classloader) false)
          config             (.getConfiguration ctx)
          appender           (metabase-appender)]
      (.start appender)
      (.addAppender config appender)
      (doseq [[_ ^LoggerConfig logger-config] (.getLoggers config)]
        (.addAppender logger-config appender (.getLevel logger-config) (.getFilter logger-config))
        (.updateLoggers ctx)))))
