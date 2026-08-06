(ns metabase.channel.events.slack
  (:require
   [metabase.events.core :as events]))

(events/derive! ::event :metabase/event)
(events/derive! :event/slack-token-invalid ::event)
