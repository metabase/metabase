(ns metabase.revisions.events
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)

(defn- push-revision!
  [model
   {:keys [user-id] object :object :as event}
   {:keys [is-creation?]
    :or   {is-creation? false}
    :as   _options}]
  (when event
    (try
      (when-not (t2/instance-of? model object)
        (throw (ex-info "object must be a model instance" {:object object :model model})))
      (let [user-id (or user-id api/*current-user-id*)]
        (revision/push-revision! {:entity       model
                                  :id           (:id object)
                                  :object       object
                                  :user-id      user-id
                                  :is-creation? is-creation?
                                  :message      (:revision-message event)}))
      (catch Throwable e
        (log/warnf "Failed to process revision event for model %s: %s" model (ex-message e))))))

(events/derive! ::card-event ::event)
(events/derive! :event/card-create ::card-event)
(events/derive! :event/card-update ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (push-revision! :model/Card event {:is-creation? (= topic :event/card-create)}))

(events/derive! ::dashboard-event ::event)
(events/derive! :event/dashboard-create ::dashboard-event)
(events/derive! :event/dashboard-update ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (push-revision! :model/Dashboard event {:is-creation? (= topic :event/dashboard-create)}))

(events/derive! ::transform-event ::event)
(events/derive! :event/transform-create ::transform-event)
(events/derive! :event/transform-update ::transform-event)

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (push-revision! :model/Transform event {:is-creation? (= topic :event/transform-create)}))

(events/derive! ::segment-event ::event)
(events/derive! :event/segment-create ::segment-event)
(events/derive! :event/segment-update ::segment-event)
(events/derive! :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic event]
  (push-revision! :model/Segment event {:is-creation? (= topic :event/segment-create)}))

(events/derive! ::measure-event ::event)
(events/derive! :event/measure-create ::measure-event)
(events/derive! :event/measure-update ::measure-event)
(events/derive! :event/measure-delete ::measure-event)

(methodical/defmethod events/publish-event! ::measure-event
  [topic event]
  (push-revision! :model/Measure event {:is-creation? (= topic :event/measure-create)}))

(events/derive! ::document-event ::event)
(events/derive! :event/document-create ::document-event)
(events/derive! :event/document-update ::document-event)
(events/derive! :event/document-delete ::document-event)

(methodical/defmethod events/publish-event! ::document-event
  [topic event]
  (push-revision! :model/Document event {:is-creation? (= topic :event/document-create)}))
