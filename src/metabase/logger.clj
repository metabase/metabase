(ns metabase.logger
  (:require [amalloy.ring-buffer :refer [ring-buffer]]
            [clj-time
             [coerce :as coerce]
             [core :as t]
             [format :as time]]
            [clojure.string :as str])
  (:import [org.apache.log4j Appender AppenderSkeleton Logger]
           org.apache.log4j.spi.LoggingEvent))

(def ^:private ^:const max-log-entries 2500)

(defonce ^:private messages* (atom (ring-buffer max-log-entries)))

(defn messages
  "Get the list of currently buffered log entries, from most-recent to oldest."
  []
  (reverse (seq @messages*)))

(defonce ^:private formatter (time/formatter "MMM dd HH:mm:ss" (t/default-time-zone)))

(defn- event->log-string [^LoggingEvent event]
  ;; for messages that include an Exception, include the string representation of it (i.e., its stacktrace)
  ;; separated by newlines
  (str/join
   "\n"
   (cons
    (let [ts    (time/unparse formatter (coerce/from-long (.getTimeStamp event)))
          level (.getLevel event)
          fqns  (.getLoggerName event)
          msg   (.getMessage event)]
      (format "%s \033[1m%s %s\033[0m :: %s" ts level fqns msg))
    (seq (.getThrowableStrRep event)))))


(defn- metabase-appender ^Appender []
  (proxy [AppenderSkeleton] []
    (append [event]
      (swap! messages* conj (event->log-string event))
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
