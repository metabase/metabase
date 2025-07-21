(ns metabase.queries.init
  (:require
   [metabase.queries.events.cards-notification-deleted-on-card-save]
   [metabase.queries.events.schema]
   [metabase.queries.models.card.metadata-sync-event :as card.metadata-sync-event]
   ;; for Malli-registered schemas
   [metabase.queries.schema]))

(set! *warn-on-reflection* true)

(defonce ^:private ^Thread card-metadata-sync-thread
  (doto (Thread. ^Runnable card.metadata-sync-event/process-events-loop "card-metadata-sync-thread")
    (.setDaemon true)
    .start))

(comment
  (.isAlive card-metadata-sync-thread)
  -)
