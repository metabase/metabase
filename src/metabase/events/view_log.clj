(ns metabase.events.view-log
  "This namespace is responsible for subscribing to events which should update the view log."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [toucan2.core :as t2]))

(defn record-view!
  "Simple base function for recording a view of a given `model` and `model-id` by a certain `user`."
  [model model-id user-id metadata]
  (t2/insert! :model/ViewLog
              :user_id  user-id
              :model    (u/lower-case-en model)
              :model_id model-id
              :metadata metadata))

(derive ::read-event :metabase/event)
(derive :event/card-read ::read-event)
(derive :event/dashboard-read ::read-event)
(derive :event/table-read ::read-event)

(m/defmethod events/publish-event! ::read-event
  "Handle processing for a single read event notification received on the view-log-channel"
  [topic {object :object :as event}]
  (try
    (when object
      (let [model    (events/topic->model topic)
            model-id (events/object->model-id topic object)
            user-id  (or (:user-id event) api/*current-user-id*)
            ;; `:context` comes
            ;; from [[metabase.query-processor.middleware.process-userland-query/add-and-save-execution-info-xform!]],
            ;; and it should only be present for `:event/card-query`
            metadata (events/object->metadata object)]
        (record-view! model model-id user-id metadata)))
    (catch Throwable e
      (log/warnf e "Failed to process activity event. %s" topic))))

(derive ::query-event :metabase/event)
(derive :event/card-query ::query-event)

(m/defmethod events/publish-event! ::query-event
  "Handle processing for a single read event notification received on the view-log-channel"
  [topic {:keys [user-id card-id] :as event}]
  (try
    (when event
      (let [model    "card"
            model-id card-id
            user-id  (or user-id api/*current-user-id*)
            metadata (events/object->metadata event)]
        (record-view! model model-id user-id metadata)))
    (catch Throwable e
      (log/warnf e "Failed to process activity event. %s" topic))))

(defsetting dismissed-custom-dashboard-toast
  (deferred-tru "Toggle which is true after a user has dismissed the custom dashboard toast.")
  :user-local :only
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)
