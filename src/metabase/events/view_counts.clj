(ns metabase.events.view-counts
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.events :as events]
            (metabase.models [activity :refer [Activity]]
                             [dashboard :refer [Dashboard]]
                             [session :refer [Session]])))


(def view-counts-topics
  "The `Set` of event topics which we subscribe to for view counting."
  #{:card-read
    :dashboard-read})

(def ^:private view-counts-channel
  "Channel for receiving event notifications we want to subscribe to for view counting."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------


(defn- record-view
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id]
  (println "weeeeee" model model-id user-id)
  ;(db/ins Activity
  ;  :topic topic
  ;  :user_id (object->user-id object)
  ;  :model (topic->model topic)
  ;  :model_id (object->model-id topic object)
  ;  :database_id database-id
  ;  :table_id table-id
  ;  :custom_id (:custom_id object)
  ;  :details (if (fn? details-fn)
  ;             (details-fn object)
  ;             object))
  )

(defn- topic->model
  "Determine a valid `model` identifier for the given `topic`."
  [topic]
  {:pre [(contains? view-counts-topics topic)]}
  ;; just take the first part of the topic name after splitting on dashes.
  (first (clojure.string/split (name topic) #"-")))

(defn- object->model-id
  "Determine the appropriate `model_id` (if possible) for a given `object`."
  [topic object]
  (if (contains? (set (keys object)) :id)
    (:id object)
    (let [model (topic->model topic)]
      (get object (keyword (format "%s_id" model))))))

(defn- object->user-id
  "Determine the appropriate `user_id` (if possible) for a given `object`."
  [object]
  (or (:actor_id object) (:user_id object) (:creator_id object)))

(defn- process-view-count-event
  "Handle processing for a single event notification received on the view-counts-channel"
  [event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} event]
      (log/info "Topic:" topic)
      (clojure.pprint/pprint object)
      (record-view
        (topic->model topic)
        (object->model-id topic object)
        (object->user-id object)))
    (catch Exception e
      (log/warn (format "Failed to process activity event. %s" (:topic event)) e))))


;;; ## ---------------------------------------- LIFECYLE ----------------------------------------


;; this is what actually kicks off our listener for events
(events/start-event-listener view-counts-topics view-counts-channel process-view-count-event)
