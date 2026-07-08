(ns metabase.channel.events.comments)

(derive ::event :metabase/event)
(derive :event/comment-created ::event)
