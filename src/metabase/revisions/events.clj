(ns metabase.revisions.events
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(defn- push-revisions!
  [model
   events
   {:keys [is-creation?]
    :or {is-creation? false}
    :as _options}]
  (revision/push-revisions!
   (for [{:keys [user-id previous-object object id revision-message]} events
         :let [user-id (or user-id api/*current-user-id*)]]
     {:entity model
      :id id
      :object object
      :previous-object previous-object
      :user-id user-id
      :is-creation? is-creation?
      :message revision-message})))

(defn- push-revision!
  [model event options]
  (when event
    (push-revisions! model [event] options)))

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (push-revision! :model/Card event {:is-creation? (= topic :event/card-create)}))

(derive ::cards-event ::event)
(derive :event/cards-create ::cards-event)
(derive :event/cards-update ::cards-event)

(methodical/defmethod events/publish-event! ::cards-event
  [topic events]
  (push-revisions! :model/Card events {:is-creation? (= topic :event/card-create)}))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-update ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (push-revision! :model/Dashboard event {:is-creation? (= topic :event/dashboard-create)}))

(derive ::dashboards-event ::event)
(derive :event/dashboards-create ::dashboards-event)
(derive :event/dashboards--update ::dashboards-event)

(methodical/defmethod events/publish-event! ::dashboards-event
  [topic events]
  (push-revisions! :model/Dashboard events {:is-creation? (= topic :event/dashboard-create)}))

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

(derive ::document-event ::event)
(derive :event/document-create ::document-event)
(derive :event/document-update ::document-event)
(derive :event/document-delete ::document-event)

(methodical/defmethod events/publish-event! ::document-event
  [topic event]
  (push-revision! :model/Document event {:is-creation? (= topic :event/document-create)}))
