(ns metabase.events.sync-database
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase
             [events :as events]
             [sync :as sync]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.util.i18n :refer [trs]]))

(def ^:const sync-database-topics
  "The `Set` of event topics which are subscribed to for use in database syncing."
  #{:database-create
    :database-trigger-sync})

(def ^:private sync-database-channel
  "Channel for receiving event notifications we want to subscribe to for database sync events."
  (async/chan))


;;; ------------------------------------------------ EVENT PROCESSING ------------------------------------------------


(defn process-sync-database-event
  "Handle processing for a single event notification received on the sync-database-channel"
  [sync-database-event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} sync-database-event]
      (when-let [database (Database (events/object->model-id topic object))]
        ;; just kick off a sync on another thread
        (future (try
                  ;; only do the 'full' sync if this is a "full sync" database. Otherwise just do metadata sync only
                  (if (:is_full_sync database)
                    (sync/sync-database! database)
                    (sync-metadata/sync-db-metadata! database))
                  (catch Throwable e
                    (log/error e (trs "Error syncing Database {0}" (u/get-id database))))))))
    (catch Throwable e
      (log/warn e (trs "Failed to process sync-database event.") (:topic sync-database-event)))))


;;; ---------------------------------------------------- LIFECYLE ----------------------------------------------------

(defn events-init
  "Automatically called during startup; start event listener for database sync events."
  []
  (events/start-event-listener! sync-database-topics sync-database-channel process-sync-database-event))
