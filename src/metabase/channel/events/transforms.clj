(ns metabase.channel.events.transforms
  (:require
   [metabase.events.core :as events]))

(events/derive! ::event :metabase/event)
(events/derive! :event/transform-failed ::event)
(events/derive! :event/transform-failure-digest ::event)
