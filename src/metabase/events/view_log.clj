(ns metabase.events.view-log
  "This namespace is responsible for subscribing to events which should update the view log."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(defn- record-view!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [{:keys [model model-id user-id metadata context has-access]}]
  (span/with-span!
    {:name       "record-view!"
     :attributes {:model/id   model-id
                  :user/id    user-id
                  :model/name (u/lower-case-en model)}}
    (t2/insert! :model/ViewLog
                :user_id    user-id
                :model      model
                :model_id   model-id
                :context    context
                :has_access has-access
                :metadata   metadata)))

(defn- generate-view
  "Generates a view, given an event map."
  [{:keys [object user-id has-access]
    :or   {has-access true}}]
  {:model-name (audit-log/model-name object)
   :user-id    (or user-id api/*current-user-id*)
   :model-id   (u/id object)
   :has_access has-access})

(derive ::read-event :metabase/event)
(derive :event/card-read ::read-event)
(derive :event/table-read ::read-event)
(derive :event/read-permission-failure ::read-event)

(m/defmethod events/publish-event! ::read-event
  "Handle processing for a generic read event notification"
  [topic event]
  (try
    (-> event
        generate-view
        record-view!)
    (catch Throwable e
      (log/warnf e "Failed to process view_log event. %s" topic))))

(derive ::dashcard-read :metabase/event)
(derive :event/dashboard-read ::dashcard-read)

(defn- readable-dashcard?
  "Returns true if the dashcard's card was readable by the current user, and false otherwise. Unreadable cards are
  replaced with maps containing just the card's ID, so we can check for this to determine whether the card was readable"
  [dashcard]
  (let [card (:card dashcard)]
    (not= (set (keys card)) #{:id})))

(m/defmethod events/publish-event! ::dashboard-read-event
  "Handle processing for the dashboard read event. Logs the dashboard view as well as card views for each card on the
  dashboard."
  [topic {:keys [object user-id] :as event}]
  (try
    (let [dashcards (:dashcards object)
          user-id   (or user-id api/*current-user-id*)
          views     (map (fn [dashcard]
                           {:model      "Card"
                            :model_id   (u/id dashcard)
                            :user_id    user-id
                            :has_access (readable-dashcard? dashcard)
                            :context    "Dashboard"})
                         dashcards)
          dash-view (generate-view event)]
      (t2/insert! :model/ViewLog (cons dash-view views)))
    (catch Throwable e
       (log/warnf e "Failed to process view_log event. %s" topic))))
