(ns metabase-enterprise.metabot-v3.api.slackbot.events
  "Event definitions for slackbot."
  (:require
   [metabase.util.malli.registry :as mr]))

(def SlackEventsResponse
  "Malli schema for Slack events API response"
  [:map
   ;; Response status is expected to be 2xx to indicate the event was received
   ;; https://docs.slack.dev/apis/events-api/#error-handling
   [:status  [:= 200]]
   [:headers [:map ["Content-Type" [:= "text/plain"]]]]
   [:body    :string]])

(def SlackUrlVerificationEvent
  "Malli schema for Slack url_verification event"
  [:map
   [:type      [:= "url_verification"]]
   [:challenge :string]])

(def SlackFile
  "Malli schema for a file attached to a Slack message"
  [:map
   [:id :string]
   [:name :string]
   [:mimetype {:optional true} [:maybe :string]]
   [:filetype {:optional true} [:maybe :string]]
   [:url_private :string]
   [:size :int]])

(def SlackMessageEvent
  "Base schema for Slack message events"
  [:map
   [:type [:= "message"]]
   [:channel :string]
   [:user :string]
   [:ts :string]
   [:event_ts :string]
   [:bot_id {:optional true} [:maybe :string]]])

(def SlackMessageImEvent
  "Schema for message.im events (direct messages)"
  [:merge SlackMessageEvent
   [:map
    [:channel_type [:= "im"]]
    [:text :string]
    [:thread_ts {:optional true} [:maybe :string]]]])

(def SlackMessageChannelsEvent
  "Schema for message.channels events (public channel messages)"
  [:merge SlackMessageEvent
   [:map
    [:channel_type [:= "channel"]]
    [:text :string]
    [:thread_ts {:optional true} [:maybe :string]]]])

(def SlackMessageFileShareEvent
  "Schema for file_share message events"
  [:merge SlackMessageEvent
   [:map
    [:subtype [:= "file_share"]]
    [:channel_type :string]
    [:files [:sequential SlackFile]]
    [:text {:optional true} [:maybe :string]]
    [:thread_ts {:optional true} [:maybe :string]]]])

(def SlackAppMentionEvent
  "Schema for app_mention events (when bot is @mentioned)"
  [:map
   [:type [:= "app_mention"]]
   [:channel :string]
   [:user :string]
   [:text :string]
   [:ts :string]
   [:event_ts :string]
   [:thread_ts {:optional true} [:maybe :string]]])

(def SlackKnownMessageEvent
  "Schema for event_callback events that we handle."
  [:or
   ;; Events based on :subtype come first as :subtype is unambiguous.
   SlackMessageFileShareEvent
   ;; Events based on :channel_type. These are generic message events that might overlap with the above. For example,
   ;; a SlackMessageFileShareEvent might have either :channel_type. Maybe these should be "mixins", but for now we
   ;; only need to distinguish file_share vs im vs channel messages.
   SlackMessageImEvent
   SlackMessageChannelsEvent])

(def SlackEventCallbackEvent
  "Malli schema for Slack event_callback event"
  [:map
   [:type [:= "event_callback"]]
   [:event [:or
            SlackAppMentionEvent
            SlackKnownMessageEvent
            ;; Fallback for any other valid event type
            [:map
             [:type :string]
             [:event_ts :string]]]]])

(defn known-user-message?
  "Check if event is a user message (not bot/system message).
   Returns true if the event has no bot_id and matches a known message schema."
  [event]
  (and (nil? (:bot_id event))
       (mr/validate SlackKnownMessageEvent event)))

(defn app-mention?
  "Check if event is an app_mention event (when bot is @mentioned)."
  [event]
  (mr/validate SlackAppMentionEvent event))

(defn edited-message?
  "Check if event is an edited message (message_changed subtype or has :edited key)."
  [event]
  (or (= (:subtype event) "message_changed")
      (some? (:edited event))))

(defn app-mention-with-files?
  "Check if event is an app_mention that has file attachments.
   When a user @mentions the bot with a file in a channel, Slack sends two events:
   1. message.channels with subtype: file_share (handled by process-message-file-share)
   2. app_mention (this duplicate needs to be skipped)
   We skip app_mention events with files to avoid duplicate processing."
  [event]
  (and (app-mention? event)
       (seq (:files event))))

(defn event->reply-context
  "Extract the necessary context for a reply from the given `event`"
  [event]
  {:channel (:channel event)
   :thread_ts (or (:thread_ts event)
                  (:ts event))})
