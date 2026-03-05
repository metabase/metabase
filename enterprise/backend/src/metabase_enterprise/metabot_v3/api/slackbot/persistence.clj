(ns metabase-enterprise.metabot-v3.api.slackbot.persistence
  "Slack-specific persistence: reconstruct conversation history from stored messages."
  (:require
   [toucan2.core :as t2]))

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
                    :slack_msg_id [:in slack-msg-ids])
         (keep (fn [{:keys [slack_msg_id] :as msg}]
                 (when-let [parts (seq (extract-history-messages msg))]
                   [slack_msg_id parts])))
         (into {}))))
