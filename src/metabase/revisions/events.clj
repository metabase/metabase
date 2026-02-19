(ns metabase.revisions.events
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

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
        (log/warnf e "Failed to process revision event for model %s" model)))))

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (push-revision! :model/Card event {:is-creation? (= topic :event/card-create)}))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-update ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (push-revision! :model/Dashboard event {:is-creation? (= topic :event/dashboard-create)}))

(derive ::transform-event ::event)
(derive :event/transform-create ::transform-event)
(derive :event/transform-update ::transform-event)

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (push-revision! :model/Transform event {:is-creation? (= topic :event/transform-create)}))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic event]
  (push-revision! :model/Segment event {:is-creation? (= topic :event/segment-create)}))

(derive ::measure-event ::event)
(derive :event/measure-create ::measure-event)
(derive :event/measure-update ::measure-event)
(derive :event/measure-delete ::measure-event)

(methodical/defmethod events/publish-event! ::measure-event
  [topic event]
  (push-revision! :model/Measure event {:is-creation? (= topic :event/measure-create)}))

(derive ::document-event ::event)
(derive :event/document-create ::document-event)
(derive :event/document-update ::document-event)
(derive :event/document-delete ::document-event)

(methodical/defmethod events/publish-event! ::document-event
  [topic event]
  (push-revision! :model/Document event {:is-creation? (= topic :event/document-create)}))
