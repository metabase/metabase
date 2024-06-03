(ns metabase.events.recent-views
  "This namespace is responsible for subscribing to events which should update the recent views for a user."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.recent-views :as recent-views]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]))

(derive ::event :metabase/event)

(derive ::dashboard-read :metabase/event)
(derive :event/dashboard-read ::dashboard-read)

(m/defmethod events/publish-event! ::dashboard-read
  "Handle processing for a single event notification which should update the recent views for a user."
  [topic {:keys [object-id user-id] :as _event}]
  (try
    (let [model-id object-id
          user-id  (or user-id api/*current-user-id*)]
      (recent-views/update-users-recent-views! user-id :model/Dashboard model-id :view))
    (catch Throwable e
      (log/warnf e "Failed to process recent_views event: %s" topic))))

(derive ::table-read :metabase/event)
(derive :event/table-read ::table-read)

(m/defmethod events/publish-event! ::table-read
  "Handle processing for a single table read event."
  [topic {:keys [object user-id] :as _event}]
  (span/with-span!
    {:name (str "recent-views-" (name topic))
     :topic topic
     :user-id user-id}
    (try
      (when object
        (let [model-id (u/id object)
              user-id  (or user-id api/*current-user-id*)]
          (recent-views/update-users-recent-views! user-id :model/Table model-id :view)))
      (catch Throwable e
        (log/warnf e "Failed to process recent_views event: %s" topic)))))

(derive ::card-query-event :metabase/event)
(derive :event/card-query ::card-query-event)

(m/defmethod events/publish-event! ::card-query-event
  "Handle processing for a single card query event."
  [topic {:keys [card-id user-id context] :as _event}]
  (try
    (let [user-id  (or user-id api/*current-user-id*)]
      ;; we don't want to count pinned card views
      (when-not (#{:collection :dashboard} context)
        (recent-views/update-users-recent-views! user-id :model/Card card-id :view)))
    (catch Throwable e
      (log/warnf e "Failed to process recent_views event: %s" topic))))

(derive ::legacy-card-event :metabase/event)
;; in practice, updating or creating a card will immediately trigger a card-read
(derive :event/card-read ::legacy-card-event)

(m/defmethod events/publish-event! ::legacy-card-event
  "Handle recent-view processing for card reads"
  [topic {:keys [object-id user-id context]}]
  (when (= context :question)
    ;; GET /api/card/:id will trigger a card-read event. We don't want to count _pinned collection views_ as recent-views,
    ;; so a collection with pinned questions will send a request with context==:collection, which we skip below:
    (try
      (recent-views/update-users-recent-views! (or user-id api/*current-user-id*) :model/Card object-id :view)
      (catch Throwable e
        (log/warnf e "Failed to process recent_views event: %s" topic)))))

(derive ::collection-touch-event :metabase/event)
(derive :event/collection-touch ::collection-touch-event)

(m/defmethod events/publish-event! ::collection-touch-event
  "Handle processing for a single collection touch event."
  [topic {:keys [collection-id user-id] :as _event}]
  (try
    (recent-views/update-users-recent-views! (or user-id api/*current-user-id*) :model/Collection collection-id :view)
    (catch Throwable e
      (log/warnf e "Failed to process recent_views event: %s" topic))))
