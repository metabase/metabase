(ns metabase.events.view-log
  (:require
   [clojure.core.async :as a]
   [metabase.events :as events]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.view-log :refer [ViewLog]]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private view-log-topics
  "The `Set` of event topics which we subscribe to for view counting."
  #{:card-create
    :card-read
    :card-query
    :dashboard-read
    :table-read})

(defonce ^:private ^{:doc "Channel for receiving event notifications we want to subscribe to for view counting."}
  view-log-channel
  (a/chan))


;;; ## ---------------------------------------- EVENT PROCESSING ----------------------------------------

(defn- record-view!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id metadata]
  ;; TODO - we probably want a little code that prunes old entries so that this doesn't get too big
  (t2/insert! ViewLog
              :user_id  user-id
              :model    model
              :model_id model-id
              :metadata metadata))

(defsetting user-recent-views
  (deferred-tru "List of the 10 most recently viewed items for the user.")
  :user-local :only
  :default []
  :type :json)

(defn- update-users-recent-views
  [user-id model model-id]
  (mw.session/with-current-user user-id
    (let [view        {:model    (name model)
                       :model_id model-id}
          prior-views (user-recent-views)]
      (when-not ((set prior-views) view)
        (let [new-views (if (< (count prior-views) 10)
                          (conj (vec prior-views) view)
                          (conj (vec (rest prior-views)) view))]
          (user-recent-views! new-views))))))

(defn handle-view-event!
  "Handle processing for a single event notification received on the view-log-channel"
  [event]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when-let [{topic :topic object :item} event]
      (let [model    (events/topic->model topic)
            model-id (events/object->model-id topic object)
            user-id  (events/object->user-id object)]
        (when (#{:card-read :dashboard-read :table-read} topic)
          (update-users-recent-views user-id model model-id))
        (record-view! model model-id user-id (events/object->metadata object))))
    (catch Throwable e
      (log/warn (format "Failed to process activity event. %s" (:topic event)) e))))


;;; ## ---------------------------------------- LIFECYLE ----------------------------------------

(defmethod events/init! ::ViewLog
  [_]
  (events/start-event-listener! view-log-topics view-log-channel handle-view-event!))
