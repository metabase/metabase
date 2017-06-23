(ns metabase.events.sync-database
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase
             [events :as events]
             [sync-database :as sync-database]]
            [metabase.models.database :refer [Database]]))

(def ^:const sync-database-topics
  "The `Set` of event topics which are subscribed to for use in database syncing."
  #{:database-create
    :database-trigger-sync})

(def ^:private sync-database-channel
  "Channel for receiving event notifications we want to subscribe to for database sync events."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-sync-database-event
  "Handle processing for a single event notification received on the sync-database-channel"
  [sync-database-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} sync-database-event]
      (when-let [database (Database (events/object->model-id topic object))]
        ;; just kick off a sync on another thread
        (future (try
                  (sync-database/sync-database! database)
                  (catch Throwable t
                    (log/error (format "Error syncing Database: %d" (:id database)) t))))))
    (catch Throwable e
      (log/warn (format "Failed to process sync-database event. %s" (:topic sync-database-event)) e))))



;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start event listener for database sync events."
  []
  (events/start-event-listener! sync-database-topics sync-database-channel process-sync-database-event))
