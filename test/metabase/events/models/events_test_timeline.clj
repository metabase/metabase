(ns metabase.events.models.events-test-timeline
  "Models of the timeline table that derive the events trait, for the tests of the event bus."
  (:require
   [metabase.events.core :as events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name ::Timeline [_model] :timeline)

(doto ::Timeline
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec ::Timeline
  [_model]
  {:create :event/events-test-timeline-create
   :update :event/events-test-timeline-update
   :delete :event/events-test-timeline-delete})

(methodical/defmethod t2/table-name ::TimelineUpdateOnly [_model] :timeline)

(doto ::TimelineUpdateOnly
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec ::TimelineUpdateOnly
  [_model]
  {:update :event/events-test-timeline-update-only-update})

(methodical/defmethod t2/table-name ::TimelineSelfUpdate [_model] :timeline)

(doto ::TimelineSelfUpdate
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec ::TimelineSelfUpdate
  [_model]
  {:create :event/events-test-timeline-self-update-create
   :update :event/events-test-timeline-self-update-update})

(t2/define-after-insert ::TimelineSelfUpdate
  [row]
  (t2/update! ::TimelineSelfUpdate :id (:id row) {:description "set by the hook"})
  row)
