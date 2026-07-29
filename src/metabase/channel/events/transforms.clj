(ns metabase.channel.events.transforms)

(derive ::event :metabase/event)
(derive :event/transform-failed ::event)
(derive :event/transform-failure-digest ::event)
