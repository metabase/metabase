(ns metabase.events.revision
  (:require
   [metabase.events :as events]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.revision :refer [push-revision!]]
   [metabase.models.segment :refer [Segment]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(def ^:private revisions-topics
  "The `Set` of event topics which are subscribed to for use in revision tracking."
  #{:event/card-create
    :event/card-update
    :event/dashboard-create
    :event/dashboard-update
    :event/dashboard-add-cards
    :event/dashboard-remove-cards
    :event/dashboard-reposition-cards
    :event/dashboard-add-tabs
    :event/dashboard-remove-tabs
    :event/dashboard-update-tabs
    :event/metric-create
    :event/metric-update
    :event/metric-delete
    :event/segment-create
    :event/segment-update
    :event/segment-delete})

(doseq [topic revisions-topics]
  (derive topic ::event))

(methodical/defmethod events/publish-event! ::event
  "Handle processing for a single event notification received on the revisions-channel"
  [topic object]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    (when object
      (let [model            (events/topic->model topic)
            id               (events/object->model-id topic object)
            user-id          (events/object->user-id object)
            revision-message (:revision_message object)]
        ;; TODO: seems unnecessary to select each entity again, is there a reason we aren't using `object` directly?
        (case model
          "card"      (push-revision! :entity       Card,
                                      :id           id,
                                      :object       (t2/select-one Card :id id),
                                      :user-id      user-id,
                                      :is-creation? (= :event/card-create topic)
                                      :message      revision-message)
          "dashboard" (push-revision! :entity       Dashboard,
                                      :id           id,
                                      :object       (t2/select-one Dashboard :id id),
                                      :user-id      user-id,
                                      :is-creation? (= :event/dashboard-create topic)
                                      :message      revision-message)
          "metric"    (push-revision! :entity       Metric,
                                      :id           id,
                                      :object       (t2/select-one Metric :id id),
                                      :user-id      user-id,
                                      :is-creation? (= :event/metric-create topic)
                                      :message      revision-message)
          "segment"   (push-revision! :entity       Segment,
                                      :id           id,
                                      :object       (t2/select-one Segment :id id),
                                      :user-id      user-id,
                                      :is-creation? (= :event/segment-create topic)
                                      :message      revision-message))))
    (catch Throwable e
      (log/warnf e "Failed to process revision event. %s" topic))))
