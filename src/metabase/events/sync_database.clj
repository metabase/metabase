(ns metabase.events.sync-database
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            [metabase.sfc :as sfc]
            [metabase.task.sync :as schedule-sync]))

(def ^:const sync-database-topics
  "The `Set` of event topics which are subscribed to for use in database syncing."
  #{:database-create
    :database-trigger-sync})

(def ^:private sync-database-channel
  "Channel for receiving event notifications we want to subscribe to for database sync events."
  (async/chan))

(def ^:private sync-update-channel
  "channel for events that happen when a DB is changed or a new DB created."
  (async/chan))

(def ^:private sync-delete-channel
  "channel for events where a manual sync has been requested."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------

(defn- process-event-with-database
  "extract a database from an event and call the supplied function with it"
  [event-fn event-name event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic database :item} event]
      (event-fn database))
    (catch Throwable e
      (log/warn (format "Failed to process %s event. %s" event-name (:topic event)) e))))

(defn- process-sync-database-event
  "Handle processing for a single event notification received on the sync-database-channel"
  [sync-database-event]
  (process-event-with-database sfc/sync-fingerprint-classify-database-async! "sync-database" sync-database-event))

(defn- process-create-update-event
  "clean up sync schedules when a database is deleted"
  [create-database-event]
  (process-event-with-database schedule-sync/schedule-db-sync-actions "create/update" create-database-event))

(defn- process-delete-event
  "clean up sync schedules when a database is deleted"
  [delete-database-event]
  (process-event-with-database schedule-sync/unschedule-all-tasks-for-db "delete" delete-database-event))
;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start event listener for database sync events."
  []
  (events/start-event-listener! sync-database-topics sync-database-channel process-sync-database-event)
  (events/start-event-listener! #{:database-schedule-update} sync-update-channel process-create-update-event)
  (events/start-event-listener! #{:database-schedule-delete} sync-delete-channel process-delete-event))
