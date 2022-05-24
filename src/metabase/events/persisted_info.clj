(ns metabase.events.persisted-info
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            [metabase.models :refer [Database PersistedInfo]]
            [metabase.models.persisted-info :as persisted-info]
            [metabase.public-settings :as public-settings]
            [toucan.db :as db]))

(def ^:private ^:const persisted-info-topics
  "The `Set` of event topics which are subscribed to for use in dependencies tracking."
  #{:card-create
    :card-update})


(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to persist new models"}
  persisted-info-channel
  (a/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-event
  "Handle processing for a single event notification received on the dependencies-channel"
  [{_topic :topic card :item :as event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when (and (:dataset card)
               (public-settings/persisted-models-enabled)
               (get-in (Database (:database_id card)) [:options :persist-models-enabled])
               (nil? (db/select-one-field :id PersistedInfo :card_id (:id card))))
      (persisted-info/turn-on! (:actor_id card) card))
    (catch Throwable e
      (log/warn (format "Failed to process persisted-info event. %s" (:topic event)) e))))


;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::PersistedInfo
  [_]
  (events/start-event-listener! persisted-info-topics persisted-info-channel process-event))
