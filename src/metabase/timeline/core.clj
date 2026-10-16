(ns metabase.timeline.core
  (:require
   [metabase.timeline.api.timeline]
   [metabase.timeline.models.timeline-event]
   [potemkin :as p]))

(comment
  metabase.timeline.api.timeline/keep-me
  metabase.timeline.models.timeline-event/keep-me)

(p/import-vars
 [metabase.timeline.api.timeline
  list-timelines
  get-timeline]
 [metabase.timeline.models.timeline-event
  dashcard-timeline-events
  include-events
  include-events-singular])
