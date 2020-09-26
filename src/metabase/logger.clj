(ns metabase.logger
  (:require [amalloy.ring-buffer :refer [ring-buffer]]
            [clj-time
             [coerce :as coerce]
             [format :as time]]
            [metabase.config :refer [local-process-uuid]])
  (:import org.apache.commons.lang3.exception.ExceptionUtils
           [org.apache.logging.log4j Level LogManager]
           [org.apache.logging.log4j.core Appender Filter LogEvent LoggerContext]))

(def ^:private ^:const max-log-entries 2500)

(defonce ^:private messages* (atom (ring-buffer max-log-entries)))

(defn messages
  "Get the list of currently buffered log entries, from most-recent to oldest."
  []
  (reverse (seq @messages*)))

(defn- event->log-data [^LogEvent event]
  {:timestamp    (time/unparse (time/formatter :date-time)
                               (coerce/from-long (.getTimeMillis event)))
   :level        (.getLevel event)
   :fqns         (.getLoggerName event)
   :msg          (.getMessage event)
   :exception    (when-let [throwable (.getThrown event)]
                   (ExceptionUtils/getStackFrames throwable))
   :process_uuid local-process-uuid})

(defn- metabase-appender ^Appender []
  (proxy [Appender] []
    (append [event]
      (swap! messages* conj (event->log-data event))
      nil)

    (getName []
      "metabase")))

(defonce ^:private has-added-appender? (atom false))

(when-not *compile-files*
  (when-not @has-added-appender?
    (reset! has-added-appender? true)
    (let [^LoggerContext ctx (LogManager/getContext false)
          config             (.getConfiguration ctx)
          appender           (metabase-appender)
          ^Filter filter     nil]
      (.addAppender (.getRootLogger config) appender Level/ALL filter)
      (.updateLoggers ctx))))
