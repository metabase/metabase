(ns metabase.events.recent-views
  "This namespace is responsible for subscribing to events which should update the recent views for a user."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.recent-views :as recent-views]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as m]))

(derive ::event :metabase/event)

(derive :event/dashboard-read ::event)
(derive :event/table-read ::event)

(m/defmethod events/publish-event! ::event
  "Handle processing for a single event notification which should update the recent views for a user."
  [topic {:keys [object user-id] :as _event}]
  (try
    (when object
      (let [model    (audit-log/model-name object)
            model-id (u/id object)
            user-id  (or user-id api/*current-user-id*)]
        (recent-views/update-users-recent-views! user-id model model-id)))
    (catch Throwable e
      (log/warnf e "Failed to process recent_views event: %s" topic))))

(derive ::card-query-event :metabase/event)
(derive :event/card-query ::card-query-event)

(m/defmethod events/publish-event! ::card-query-event
  "Handle processing for a single card query event."
  [topic {:keys [card-id user-id context] :as _event}]
  (try
    (let [model    "card"
          user-id  (or user-id api/*current-user-id*)]
      ;; we don't want to count pinned card views
      (when-not (#{:collection :dashboard} context)
        (recent-views/update-users-recent-views! user-id model card-id)))
    (catch Throwable e
      (log/warnf e "Failed to process recent_views event: %s" topic))))
