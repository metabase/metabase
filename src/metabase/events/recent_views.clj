(ns metabase.events.recent-views
  "This namespace is responsible for subscribing to events which should update the recent views for a user."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.recent-views :as recent-views]
   [metabase.util.log :as log]
   [methodical.core :as m]))

(derive ::event :metabase/event)

(derive :event/dashboard-read ::event)
(derive :event/table-read ::event)

(m/defmethod events/publish-event! ::event
  "Handle processing for a single event notification which should update the recent views for a user."
  [topic {:keys [object] :as _event}]
  (try
    (when object
      (let [model             (events/topic->model topic)
            model-id          (events/object->model-id topic object)
            user-id           (or (:user-id object) api/*current-user-id*)
            ;; `:context` comes
            ;; from [[metabase.query-processor.middleware.process-userland-query/add-and-save-execution-info-xform!]],
            ;; and it should only be present for `:event/card-query`
            {:keys [context]} (events/object->metadata object)]
        ;; we don't want to count pinned card views
        (when ((complement #{:collection :dashboard}) context)
          (recent-views/update-users-recent-views! user-id model model-id))))
    (catch Throwable e
      (log/warnf e "Failed to process activity event: %s" topic))))

(derive ::query-event :metabase/event)
(derive :event/card-query ::query-event)

(m/defmethod events/publish-event! ::query-event
  "Handle processing for a single read event notification received on the view-log-channel"
  [topic {:keys [user-id card-id context] :as event}]
  (try
    (when event
      (let [model   "card"
            user-id (or user-id api/*current-user-id*)]
        (when ((complement #{:collection :dashboard}) context)
          (recent-views/update-users-recent-views! user-id model card-id))))
    (catch Throwable e
      (log/warnf e "Failed to process activity event. %s" topic))))
