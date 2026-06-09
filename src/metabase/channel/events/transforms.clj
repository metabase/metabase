(ns metabase.channel.events.transforms)

(derive ::event :metabase/event)
(derive :event/transform-failed ::event)
