(ns metabase.events.view-log
  "This namespace is responsible for subscribing to events which should update the view log and view counts."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.query.permissions :as query-perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(defn increment-view-counts!
  "Increments the view_count column for a model given a list of ids.
   Assumes the model has one primary key `id`, and the column for the view count is named `view_count`"
  [model & ids]
  (when (seq ids)
    (t2/query {:update (t2/table-name model)
               :set    {:view_count [:+ :view_count [:inline 1]]}
               :where  [:in :id ids]})))

(defn- record-views!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [view-or-views]
  (span/with-span!
    {:name "record-view!"}
    (when (premium-features/log-enabled?)
      (t2/insert! :model/ViewLog view-or-views))))

(defn- generate-view
  "Generates a view, given an event map."
  [{:keys [object user-id has-access]
    :or   {has-access true}}]
  {:model      (u/lower-case-en (audit-log/model-name object))
   :user_id    (or user-id api/*current-user-id*)
   :model_id   (u/id object)
   :has_access has-access})

(derive ::card-read-event :metabase/event)
(derive :event/card-read ::card-read-event)

(m/defmethod events/publish-event! ::card-read-event
  "Handle processing for a generic read event notification"
  [topic {:keys [object user-id] :as event}]
  (span/with-span!
    {:name "view-log-card-read"
     :topic topic
     :user-id user-id}
    (try
      (increment-view-counts! :model/Card (:id object))
      (-> event
          generate-view
          (assoc :context "question")
          record-views!)
      (catch Throwable e
        (log/warnf e "Failed to process view event. %s" topic)))))

(derive ::collection-read-event :metabase/event)
(derive :event/collection-read ::collection-read-event)

(m/defmethod events/publish-event! ::collection-read-event
  "Handle processing for a generic read event notification"
  [topic event]
  (try
    (-> event
        generate-view
        record-views!)
    (catch Throwable e
      (log/warnf e "Failed to process view event. %s" topic))))

(derive ::read-permission-failure :metabase/event)
(derive :event/read-permission-failure ::read-permission-failure)

(m/defmethod events/publish-event! ::read-permission-failure
  "Handle processing for a generic read event notification"
  [topic {:keys [object] :as event}]
  (try
    ;; Only log permission check failures for Cards and Dashboards. This set can be expanded if we add view logging of
    ;; other models.
    (when (#{:model/Card :model/Dashboard} (t2/model object))
     (-> event
         generate-view
         record-views!))
    (catch Throwable e
      (log/warnf e "Failed to process view event. %s" topic))))

(derive ::dashboard-read :metabase/event)
(derive :event/dashboard-read ::dashboard-read)

(defn- readable-dashcard?
  "Returns true if the dashcard's card was readable by the current user, and false otherwise. Unreadable cards are
  replaced with maps containing just the card's ID, so we can check for this to determine whether the card was readable"
  [dashcard]
  (let [card (:card dashcard)]
    (not= (set (keys card)) #{:id})))

(m/defmethod events/publish-event! ::dashboard-read
  "Handle processing for the dashboard read event. Logs the dashboard view as well as card views for each card on the
  dashboard."
  [topic {:keys [object user-id] :as event}]
  (span/with-span!
    {:name "view-log-dashboard-read"
     :topic topic
     :user-id user-id}
    (try
      (let [dashcards (filter :card_id (:dashcards object)) ;; filter out link/text cards wtih no card_id
            user-id   (or user-id api/*current-user-id*)
            views     (map (fn [dashcard]
                             {:model      "card"
                              :model_id   (u/id (:card_id dashcard))
                              :user_id    user-id
                              :has_access (readable-dashcard? dashcard)
                              :context    "dashboard"})
                           dashcards)
            dash-view (generate-view event)]
        (apply increment-view-counts! :model/Card (map :card_id dashcards))
        (increment-view-counts! :model/Dashboard (:id object))
        (record-views! (cons dash-view views)))
      (catch Throwable e
        (log/warnf e "Failed to process view event. %s" topic)))))

(derive ::table-read :metabase/event)
(derive :event/table-read ::table-read)

(m/defmethod events/publish-event! ::table-read
  "Handle processing for the table read event. Does a basic permissions check to see if the the user has data perms for
  the table."
  [topic {:keys [object user-id] :as event}]
  (span/with-span!
    {:name "view-log-table-read"
     :topic topic
     :user-id user-id}
    (try
      (increment-view-counts! :model/Table (:id object))
      (let [table-id    (u/id object)
            database-id (:db_id object)
            has-access? (when (= api/*current-user-id* user-id)
                          (query-perms/can-query-table? database-id table-id))]
        (-> event
            (assoc :has-access has-access?)
            generate-view
            record-views!))
      (catch Throwable e
        (log/warnf e "Failed to process view event. %s" topic)))))
