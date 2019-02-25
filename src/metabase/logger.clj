(ns metabase.logger
  (:gen-class
   :extends org.apache.log4j.AppenderSkeleton
   :name metabase.logger.Appender)
  (:require [amalloy.ring-buffer :refer [ring-buffer]]
            [clj-time
             [coerce :as coerce]
             [core :as t]
             [format :as time]]
            [clojure.string :as str])
  (:import org.apache.log4j.spi.LoggingEvent))

(def ^:private ^:const max-log-entries 2500)

(defonce ^:private messages (atom (ring-buffer max-log-entries)))

;; TODO - rename to `messages`
(defn get-messages
  "Get the list of currently buffered log entries, from most-recent to oldest."
  []
  (reverse (seq @messages)))


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

(defn -append
  "Append a new EVENT to the `messages` atom.
   [Overrides an `AppenderSkeleton`
  method](http://logging.apache.org/log4j/1.2/apidocs/org/apache/log4j/AppenderSkeleton.html#append(org.apache.log4j.spi.LoggingEvent))"
  [_, ^LoggingEvent event]
  (swap! messages conj (event->log-string event))
  nil)

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
