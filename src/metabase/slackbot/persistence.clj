(ns metabase.slackbot.persistence
  "Slack-specific persistence: reconstruct conversation history from stored messages."
  (:require
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.schema.v2 :as schema.v2]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- extract-history-messages
  "Walk `(:data message)` in insertion order and emit AI-SDK-message maps for
  history replay. Preserves adjacency of tool calls and their tool results.
  Unresolved tool calls, text parts, and data parts are skipped — assistant
  text comes from Slack's copy of the thread."
  [message]
  (->> (or (:data message) [])
       (schema.v2/check-message-data "slack history replay metabot_message.data")
       (into [] (mapcat #(metabot.persistence/tool-part->llm-messages % {:on-unresolved :skip})))))

(defn message-history
  "Tool call history for Slack messages. Returns {slack-msg-id -> [messages...]}.
  Only [[metabase.metabot.persistence/replayable-assistant-row?]] rows contribute."
  [conversation-id slack-msg-ids]
  (when (seq slack-msg-ids)
    (->> (t2/select :model/MetabotMessage
                    'conversation_id conversation-id
                    'role "assistant"
                    'deleted_at nil
                    'slack_msg_id ['in slack-msg-ids])
         ;; A failed turn's state is dropped by [[metabase.metabot.persistence/conversation-state]], so
         ;; replaying its tool calls would announce queries the seeded state does not contain.
         (filter metabot.persistence/replayable-assistant-row?)
         (keep (fn [{:keys [slack_msg_id] :as msg}]
                 (when-let [parts (seq (extract-history-messages msg))]
                   [slack_msg_id parts])))
         (into {}))))

(defn deleted-message-ids
  "Slack message ids for assistant responses that were soft-deleted."
  [conversation-id slack-msg-ids]
  (when (seq slack-msg-ids)
    (t2/select-fn-set :slack_msg_id
                      :model/MetabotMessage
                      'conversation_id conversation-id
                      'role "assistant"
                      'deleted_at ['not= nil]
                      'slack_msg_id ['in slack-msg-ids])))

(defn state-messages
  "The assistant rows of a Slack thread in reader order, for feeding
  [[metabase.metabot.persistence/conversation-state]].

  Carries only the columns that function filters and merges on, so a long thread's
  `data` blobs aren't loaded just to get at `state`. Not usable for history replay —
  see [[message-history]] for that."
  [conversation-id]
  (t2/select [:model/MetabotMessage 'id 'role 'state 'error 'finished]
             'conversation_id conversation-id
             'role "assistant"
             'deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(defn response-owner-user-id
  "Find the Metabase user ID who triggered the assistant response for this Slack channel/message.
   Returns nil when the message is not tracked."
  [channel-id slack-msg-id]
  (t2/select-one-fn :user_id
                    :model/MetabotMessage
                    'channel_id   channel-id
                    'slack_msg_id slack-msg-id
                    'role         "assistant"))

(defn soft-delete-response!
  "Mark the stored assistant response for this Slack channel/message as soft-deleted."
  [channel-id slack-msg-id deleter-user-id]
  (when (and channel-id slack-msg-id deleter-user-id)
    (pos? (metabot.persistence/soft-delete-messages!
           {:channel_id   channel-id
            :slack_msg_id slack-msg-id
            :role         "assistant"}
           deleter-user-id))))
