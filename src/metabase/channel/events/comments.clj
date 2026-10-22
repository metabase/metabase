(ns metabase.channel.events.comments
  (:require
   [metabase.events.core :as events]))

(events/derive! ::event :metabase/event)
(events/derive! :event/comment-created ::event)
