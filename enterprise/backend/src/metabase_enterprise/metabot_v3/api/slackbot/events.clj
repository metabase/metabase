(ns metabase-enterprise.metabot-v3.api.slackbot.events
  "Event definitions for slackbot."
  (:require    [clojure.string :as str]))

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

(def SlackEventCallbackEvent
  "Malli schema for Slack event_callback event"
  [:map
   [:type [:= "event_callback"]]
   [:event [:map
            [:type :string]
            [:event_ts :string]]]])

(defn user-message?
  "Check if event is from a user (not a bot)."
  [event]
  (nil? (:bot_id event)))

(defn bot-message?
  "Check if event is from a bot."
  [event]
  (not (user-message? event)))

(defn dm?
  "Check if event is a direct message."
  [event]
  (= (:channel_type event) "im"))

(defn channel-message?
  "Check if event is a public channel message."
  [event]
  (= (:channel_type event) "channel"))

(defn file-share?
  "Check if event is a file share."
  [event]
  (= (:subtype event) "file_share"))

(defn has-files?
  "Check if event has files."
  [event]
  (boolean (seq (:files event))))

(defn app-mention?
  "Check if event is an app_mention event."
  [event]
  (= (:type event) "app_mention"))

(defn edited-message?
  "Check if event is an edited message (message_changed subtype or has :edited key)."
  [event]
  (or (= (:subtype event) "message_changed")
      (some? (:edited event))))

(defn app-mention-with-files?
  "Check if event is an app_mention with file attachments.
   These are skipped because file_share events handle file uploads."
  [event]
  (and (app-mention? event)
       (has-files? event)))

(defn mentions-bot?
  "Check if event @mentions the bot.
   Some events, like file uploads in channels, don't come through as app_mention."
  [event bot-user-id]
  (some-> (:text event)
          (str/includes? (str "<@" bot-user-id ">"))))

(defn dm-or-channel-mention?
  "Check if event is an dm or channel w/ mention of the bot."
  [event bot-id]
  (or
   (dm? event)
   (and (channel-message? event)
        (mentions-bot? event bot-id))))

(defn event->reply-context
  "Extract the necessary context for a reply from the given `event`"
  [event]
  {:channel (:channel event)
   :thread_ts (or (:thread_ts event)
                  (:ts event))})
