(ns metabase.logger
  (:require [amalloy.ring-buffer :refer [ring-buffer]]
            (clj-time [core :as t]
                      [coerce :as coerce]
                      [format :as time]))
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

(defn -append
  "Append a new EVENT to the `messages` atom.
   [Overrides an `AppenderSkeleton` method](http://logging.apache.org/log4j/1.2/apidocs/org/apache/log4j/AppenderSkeleton.html#append(org.apache.log4j.spi.LoggingEvent))"
  [_, ^LoggingEvent event]
  (let [ts    (time/unparse formatter (coerce/from-long (.getTimeStamp event)))
        level (.getLevel event)
        fqns  (.getLoggerName event)
        msg   (.getMessage event)]
    (swap! messages conj (format "%s \033[1m%s %s\033[0m :: %s" ts level fqns msg))
    nil))

(defn -close
  "No-op if something tries to close this logging appender.
   [Overrides an `Appender` method](http://logging.apache.org/log4j/1.2/apidocs/org/apache/log4j/Appender.html#close())"
  [_]
  nil)

(defn -requiresLayout
  "The MB logger doesn't require a layout.
  [Overrides an `Appender` method](http://logging.apache.org/log4j/1.2/apidocs/org/apache/log4j/Appender.html#getLayout())"
  [_]
  false)
