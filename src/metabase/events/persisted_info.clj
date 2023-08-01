(ns metabase.events.persisted-info
  (:require
   [clojure.core.async :as a]
   [metabase.events :as events]
   [metabase.models :refer [Database PersistedInfo]]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.public-settings :as public-settings]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private persisted-info-topics
  "The `Set` of event topics which are subscribed to add persisted-info to new models."
  #{:card-create
    :card-update})


(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to persist new models"}
  persisted-info-channel
  (a/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn process-event
  "Handle processing for a single event notification received on the persisted-info-channel"
  [{_topic :topic card :item :as event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    ;; We only want to add a persisted-info for newly created models where dataset is being set to true.
    ;; If there is already a PersistedInfo, even in "off" or "deletable" state, we skip it as this
    ;; is only supposed to be that initial edge when the dataset is being changed.
    (when (and (:dataset card)
               (public-settings/persisted-models-enabled)
               (get-in (t2/select-one Database :id (:database_id card)) [:options :persist-models-enabled])
               (nil? (t2/select-one-fn :id PersistedInfo :card_id (:id card))))
      (persisted-info/turn-on-model! (:actor_id card) card))
    (catch Throwable e
      (log/warn (format "Failed to process persisted-info event. %s" (:topic event)) e))))


;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::PersistedInfo
  [_]
  (events/start-event-listener! persisted-info-topics persisted-info-channel process-event))
