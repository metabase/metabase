(ns metabase.events.recent-views
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.recent-views :as recent-views]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(derive :event/card-read ::event)
(derive :event/card-query ::event)
(derive :event/dashboard-read ::event)
(derive :event/table-read ::event)

(defn record-view!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id metadata]
  (t2/insert! :model/ViewLog
              :user_id  user-id
              :model    (u/lower-case-en model)
              :model_id model-id
              :metadata metadata))

(methodical/defmethod events/publish-event! ::event
  "Handle processing for a single event notification received on the view-log-channel"
  [topic object]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when object
      (let [model                          (events/topic->model topic)
            model-id                       (events/object->model-id topic object)
            user-id                        api/*current-user-id*
            ;; `:context` comes
            ;; from [[metabase.query-processor.middleware.process-userland-query/add-and-save-execution-info-xform!]],
            ;; and it should only be present for `:event/card-query`
            {:keys [context] :as metadata} (events/object->metadata object)]
        (when (and (#{:event/card-query :event/dashboard-read :event/table-read} topic)
                   ;; we don't want to count pinned card views
                   ((complement #{:collection :dashboard}) context))
          (def user-id user-id)
          (def model model)
          (def model-id model-id)
          (recent-views/update-users-recent-views! user-id model model-id))
        (record-view! model model-id user-id metadata)))
    (catch Throwable e
      (log/warnf e "Failed to process activity event. %s" topic))))

