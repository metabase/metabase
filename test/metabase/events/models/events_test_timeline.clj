(ns metabase.events.models.events-test-timeline
  "A model of the timeline table that derives the events trait, for the tests of the event bus."
  (:require
   [metabase.events.core]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EventsTestTimeline [_model] :timeline)

(doto :model/EventsTestTimeline
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))
