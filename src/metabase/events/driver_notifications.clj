(ns metabase.events.driver-notifications
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [events :as events]]))

(def ^:const ^:private driver-notifications-topics
  "The `Set` of event topics which are subscribed to for use in driver notifications."
  #{:database-update :database-delete})

(def ^:private driver-notifications-channel
  "Channel for receiving event notifications we want to subscribe to for driver notifications events."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-driver-notifications-event
  "Handle processing for a single event notification received on the driver-notifications-channel"
  [driver-notifications-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (when-let [{topic :topic database :item} driver-notifications-event]
    (try
      ;; notify the appropriate driver about the updated database
      (driver/notify-database-updated (driver/engine->driver (:engine database)) database)
      (catch Throwable e
        (log/warn (format "Failed to process driver notifications event. %s" (:topic driver-notifications-event)) e)))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start event listener for database sync events."
  []
  (events/start-event-listener! driver-notifications-topics driver-notifications-channel process-driver-notifications-event))
