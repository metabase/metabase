(ns metabase.logger
  (:require [clj-time.core :as t]
            [clj-time.coerce :as coerce]
            [clj-time.format :as time]
            [amalloy.ring-buffer :refer [ring-buffer]])
  (:gen-class
    :extends org.apache.log4j.AppenderSkeleton
    :name metabase.logger.Appender)
  (:import (org.apache.log4j.spi LoggingEvent)))

(def ^:private ^:const max-log-entries 2500)

(def ^:private messages (atom (ring-buffer max-log-entries)))

(defn get-messages
  "Get the list of currently buffered log entries"
  []
  (reverse (seq @messages)))


(def ^:private formatter (time/formatter "MMM dd HH:mm:ss" (t/default-time-zone)))

(defn -append [_ ^LoggingEvent event]
  (let [ts    (time/unparse formatter (coerce/from-long (.getTimeStamp event)))
        level (.getLevel event)
        fqns  (.getLoggerName event)
        msg   (.getMessage event)]
    (swap! messages conj (format "%s %s %s :: %s" ts level fqns msg))
    nil))

(defn -close [_]
  nil)

(defn -requiresLayout [_]
  false)
