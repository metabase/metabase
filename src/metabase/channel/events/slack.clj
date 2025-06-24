(ns metabase.channel.events.slack)

(derive ::event :metabase/event)
(derive :event/slack-token-invalid ::event)
