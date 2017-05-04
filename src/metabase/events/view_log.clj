(ns metabase.events.view-log
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.events :as events]
            [metabase.models.view-log :refer [ViewLog]]
            [toucan.db :as db]))

(def ^:private ^:const view-counts-topics
  "The `Set` of event topics which we subscribe to for view counting."
  #{:card-create
    :card-read
    :dashboard-read})

(def ^:private view-counts-channel
  "Channel for receiving event notifications we want to subscribe to for view counting."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn- record-view
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id]
  ;; TODO - we probably want a little code that prunes old entries so that this doesn't get too big
  (db/insert! ViewLog
    :user_id  user-id
    :model    model
    :model_id model-id))

(defn process-view-count-event
  "Handle processing for a single event notification received on the view-counts-channel"
  [event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} event]
      (record-view
        (events/topic->model topic)
        (events/object->model-id topic object)
        (events/object->user-id object)))
    (catch Throwable e
      (log/warn (format "Failed to process activity event. %s" (:topic event)) e))))


;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


(defn events-init
  "Automatically called during startup; start the events listener for view events."
  []
  (events/start-event-listener! view-counts-topics view-counts-channel process-view-count-event))
