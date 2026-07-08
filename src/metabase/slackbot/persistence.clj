(ns metabase.slackbot.persistence
  "Slack-specific persistence: reconstruct conversation history from stored messages."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private legacy-history-block-types
  "Legacy AI-SDK-message `:_type` values that carry tool history."
  #{"TOOL_CALL" "TOOL_RESULT"})

(defn- legacy-block->history-message
  "Legacy AI-SDK-message block: keep history-relevant fields, keywordize role."
  [block]
  (-> (select-keys block [:role :content :tool_calls :tool_call_id])
      (update :role keyword)))

(defn- native-tool-input->history-message
  "Native `tool-input` block → AI-SDK-message with a single `:tool_calls` entry."
  [block]
  {:role       :assistant
   :tool_calls [{:id        (:id block)
                 :name      (:function block)
                 :arguments (:arguments block)}]})

(defn- native-tool-output->history-message
  "Native `tool-output` block → AI-SDK `tool` message. Only the `:output`
  string is needed for history replay."
  [block]
  {:role         :tool
   :tool_call_id (:id block)
   :content      (get-in block [:result :output])})

(defn- block->history-message
  "Dispatch a single stored `:data` block to an AI-SDK-message map, or nil to
  skip. Handles both legacy slackbot blocks (`:_type \"TOOL_CALL\"` /
  `\"TOOL_RESULT\"`) and native agent-loop blocks (`:type \"tool-input\"` /
  `\"tool-output\"`). Text blocks are skipped — assistant text still comes
  from Slack's copy of the thread."
  [block]
  (cond
    (legacy-history-block-types (:_type block)) (legacy-block->history-message block)
    (= "tool-input" (:type block))              (native-tool-input->history-message block)
    (= "tool-output" (:type block))             (native-tool-output->history-message block)
    :else                                       nil))

(defn- extract-history-messages
  "Walk `(:data message)` in insertion order and emit AI-SDK-message maps for
  history replay. Preserves adjacency of tool calls and their tool results."
  [message]
  (into [] (keep block->history-message) (:data message)))

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
    (t2/select-fn-set :slack_msg_id
                      :model/MetabotMessage
                      :conversation_id conversation-id
                      :role "assistant"
                      :deleted_at [:not= nil]
                      :slack_msg_id [:in slack-msg-ids])))

(defn response-owner-user-id
  "Find the Metabase user ID who triggered the assistant response for this Slack channel/message.
   Returns nil when the message is not tracked."
  [channel-id slack-msg-id]
  (t2/select-one-fn :user_id
                    :model/MetabotMessage
                    :channel_id   channel-id
                    :slack_msg_id slack-msg-id
                    :role         "assistant"))

(defn soft-delete-response!
  "Mark the stored assistant response for this Slack channel/message as soft-deleted."
  [channel-id slack-msg-id deleter-user-id]
  (when (and channel-id slack-msg-id deleter-user-id)
    (pos? (t2/update! :model/MetabotMessage
                      {:channel_id   channel-id
                       :slack_msg_id slack-msg-id
                       :role         "assistant"}
                      {:deleted_at         (java.time.OffsetDateTime/now)
                       :deleted_by_user_id deleter-user-id}))))
