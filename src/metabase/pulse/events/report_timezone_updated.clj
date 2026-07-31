(ns metabase.pulse.events.report-timezone-updated
  (:require
   [metabase.events.core :as events]
   [metabase.pulse.task.send-pulses :as send-pulses]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/report-timezone-updated ::event)

(methodical/defmethod events/publish-event! ::event
  "When the report-timezone Setting is updated, update the timezone of all SendPulse triggers."
  [_topic _event]
  (send-pulses/update-send-pulse-triggers-timezone!))
