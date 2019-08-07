(ns metabase.logger
  (:require [amalloy.ring-buffer :refer [ring-buffer]]
            [clj-time
             [coerce :as coerce]
             [core :as t]
             [format :as time]]
            [clojure.string :as str]
            [metabase.models.setting :as setting])
  (:import [org.apache.log4j Appender AppenderSkeleton Logger]
           org.apache.log4j.spi.LoggingEvent))

(def ^:private ^:const max-log-entries 2500)

(defonce ^:private messages* (atom (ring-buffer max-log-entries)))

(defn messages
  "Get the list of currently buffered log entries, from most-recent to oldest."
  []
  (reverse (seq @messages*)))

(defonce ^:private formatter (time/formatter "MMM dd HH:mm:ss" (t/default-time-zone)))

(defn- event->log-data [^LoggingEvent event]
  {:timestamp (time/unparse formatter (coerce/from-long (.getTimeStamp event)))
   :level     (.getLevel event)
   :fqns      (.getLoggerName event)
   :msg       (.getMessage event)
   :exception (.getThrowableStrRep event)
   :site_uuid (setting/get-string :site-uuid)})

(defn- metabase-appender ^Appender []
  (proxy [AppenderSkeleton] []
    (append [event]
      (swap! messages* conj (event->log-data event))
      nil)
    (close []
      nil)
    (requiresLayout []
      false)))

(defonce ^:private has-added-appender? (atom false))

(when-not *compile-files*
  (when-not @has-added-appender?
    (reset! has-added-appender? true)
    (.addAppender (Logger/getRootLogger) (metabase-appender))))
