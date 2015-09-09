(ns metabase.events.view-log
  (:require [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [metabase.db :as db]
            [metabase.events :as events]
            [metabase.models.view-log :refer [ViewLog]]))


(def view-counts-topics
  "The `Set` of event topics which we subscribe to for view counting."
  #{:card-read
    :dashboard-read})

(def ^:private view-counts-channel
  "Channel for receiving event notifications we want to subscribe to for view counting."
  (async/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------

;(defn- tally-in-time-period
;  ""
;  [period-days now tracking-start cnt]
;  {:pre [(integer? now)
;         (integer? tracking-start)
;         (integer? period-days)
;         (integer? cnt)]}
;  (let [milliseconds-since (- now tracking-start)]
;    (if (> (* period-days 24 60 60 1000) milliseconds-since)
;      {:timestamp tracking-start
;       :count     (inc cnt)}
;      {:timestamp now
;       :count     1})))
;
;(defn- record-view
;  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
;  [model model-id user-id]
;  (println "weeeeee" model model-id user-id)
;  (let [{:keys [id] :as before-tally} (or (-> (db/sel :one ViewCounts :user_id user-id :model model :model_id model-id)
;                                              (dissoc :user :model_object))
;                                          {:user_id  user-id
;                                           :model    model
;                                           :model_id model-id})
;        now (System/currentTimeMillis)
;        tally-period (fn [period-days]
;                       (let [ts-keyword (keyword (str period-days "_day_ts"))
;                             cnt-keyword (keyword (str period-days "_day_cnt"))]
;                         (-> (tally-in-time-period period-days now (or (ts-keyword before-tally) 0) (or (cnt-keyword before-tally) 0))
;                             (set/rename-keys {:timestamp ts-keyword, :count cnt-keyword}))))
;        after-tally (-> before-tally
;                        (assoc :all_time_cnt (inc (or (:all_time_cnt before-tally) 0)))
;                        (merge (tally-period 1))
;                        (merge (tally-period 7))
;                        (merge (tally-period 30)))]
;    (clojure.pprint/pprint after-tally)
;    (if id
;      (m/mapply db/upd ViewCounts id after-tally)
;      (m/mapply db/ins ViewCounts after-tally))))

(defn- record-view
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id]
  ;; TODO - we probably want a little code that prunes old entries so that this doesn't get too big
  (db/ins ViewLog
    :user_id  user-id
    :model    model
    :model_id model-id))

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
