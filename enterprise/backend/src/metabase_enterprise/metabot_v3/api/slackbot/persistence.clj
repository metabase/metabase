(ns metabase-enterprise.metabot-v3.api.slackbot.persistence
  "Slack-specific persistence: reconstruct conversation history from stored messages."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private history-message-types
  "Message types to include in history sent to ai-service."
  #{"TOOL_CALL" "TOOL_RESULT"})

(defn- normalize-history-message
  "Keep only ai-service schema fields, keywordize role."
  [msg]
  (-> (select-keys msg [:role :content :tool_calls :tool_call_id])
      (update :role keyword)))

(defn- extract-history-messages
  "Filter and normalize stored message data for history."
  [message]
  (->> (:data message)
       (filter #(history-message-types (:_type %)))
       (mapv normalize-history-message)))

(defn message-history
  "Tool call history for Slack messages. Returns {slack-msg-id -> [messages...]}."
  [conversation-id slack-msg-ids]
  (when (seq slack-msg-ids)
    (->> (t2/select :model/MetabotMessage
                    :conversation_id conversation-id
                    :role "assistant"
                    :deleted_at nil
                    :slack_msg_id [:in slack-msg-ids])
         (keep (fn [{:keys [slack_msg_id] :as msg}]
                 (when-let [parts (seq (extract-history-messages msg))]
                   [slack_msg_id parts])))
         (into {}))))

(defn deleted-message-ids
  "Slack message ids for assistant responses that were soft-deleted."
  [conversation-id slack-msg-ids]
  (when (seq slack-msg-ids)
    (->> (t2/select-fn-set :slack_msg_id
                           :model/MetabotMessage
                           :conversation_id conversation-id
                           :role "assistant"
                           :deleted_at [:not= nil]
                           :slack_msg_id [:in slack-msg-ids])
         set)))

(defn response-owner-user-id
  "Find the Metabase user ID who triggered the assistant response for this Slack channel/message.
   Returns nil when the message is not tracked."
  [channel-id slack-msg-id]
  (when-let [conversation-id (t2/select-one-fn :conversation_id
                                               :model/MetabotMessage
                                               :channel_id channel-id
                                               :slack_msg_id slack-msg-id
                                               :role "assistant")]
    (t2/select-one-fn :user_id :model/MetabotConversation :id conversation-id)))

(defn soft-delete-response!
  "Mark the stored assistant response for this Slack channel/message as soft-deleted."
  [channel-id slack-msg-id deleter-user-id]
  (when (and channel-id slack-msg-id deleter-user-id)
    (pos? (t2/update! :model/MetabotMessage
                      {:channel_id channel-id
                       :slack_msg_id slack-msg-id
                       :role "assistant"}
                      {:deleted_at         (java.time.OffsetDateTime/now)
                       :deleted_by_user_id deleter-user-id}))))
