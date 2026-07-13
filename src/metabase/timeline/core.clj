(ns metabase.timeline.core
  (:require
   [metabase.timeline.models.timeline]
   [metabase.timeline.models.timeline-event]
   [potemkin :as p]))

(comment
  metabase.timeline.models.timeline/keep-me
  metabase.timeline.models.timeline-event/keep-me)

(p/import-vars
 [metabase.timeline.models.timeline
  get-timeline]
 [metabase.timeline.models.timeline-event
  dashcard-timeline-events])
