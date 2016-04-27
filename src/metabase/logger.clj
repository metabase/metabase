(ns metabase.logger
  (:gen-class
     :extends org.apache.log4j.AppenderSkeleton
     :name metabase.logger.Appender))

(def messages (atom ()))

(defn get-messages
    []
    @messages)

(defn -append [this event]
  (swap! messages conj (.getMessage event))
  nil)

(defn -close [this]
  nil)

(defn -requiresLayout [this]
  false)
