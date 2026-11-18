(ns metabase.events.models.events-test-timeline
  "Models of the timeline table that derive the events trait, for the tests of the event bus."
  (:require
   [metabase.events.core :as events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EventsTestTimeline [_model] :timeline)

(doto :model/EventsTestTimeline
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec :model/EventsTestTimeline
  [_model]
  {:create :event/events-test-timeline-create
   :update :event/events-test-timeline-update
   :delete :event/events-test-timeline-delete})

(methodical/defmethod t2/table-name :model/EventsTestTimelineUpdateOnly [_model] :timeline)

(doto :model/EventsTestTimelineUpdateOnly
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec :model/EventsTestTimelineUpdateOnly
  [_model]
  {:update :event/events-test-timeline-update-only-update})

(methodical/defmethod t2/table-name :model/EventsTestTimelineSelfUpdate [_model] :timeline)

(doto :model/EventsTestTimelineSelfUpdate
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec :model/EventsTestTimelineSelfUpdate
  [_model]
  {:create :event/events-test-timeline-self-update-create
   :update :event/events-test-timeline-self-update-update})

(t2/define-after-insert :model/EventsTestTimelineSelfUpdate
  [row]
  (t2/update! :model/EventsTestTimelineSelfUpdate :id (:id row) {:description "set by the hook"})
  row)
