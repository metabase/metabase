(ns metabase.slackbot.persistence
  "Slack-specific persistence: reconstruct conversation history from stored messages."
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- tool-part->history-messages
  "A stored v2 tool part (`:type \"tool-<name>\"`, merged input/output) →
  AI-SDK-message pair: an assistant message with a single `:tool_calls` entry,
  plus a `tool` message when the call resolved. Parts still in
  `input-available` state (tool never finished) are skipped — there is no
  result to replay. Text and data parts are skipped — assistant text still
  comes from Slack's copy of the thread."
  [part]
  (when (and (string? (:type part))
             (str/starts-with? (:type part) "tool-")
             (not= "input-available" (:state part)))
    (let [input       (:input part)
          tool-call   {:role       :assistant
                       :tool_calls [{:id        (:toolCallId part)
                                     :name      (subs (:type part) 5)
                                     :arguments (if (string? input) input (json/encode input))}]}
          tool-result (when (#{"output-available" "output-error"} (:state part))
                        {:role         :tool
                         :tool_call_id (:toolCallId part)
                         :content      (or (get-in part [:output :output])
                                           (:errorText part)
                                           "Tool execution failed")})]
      (cond-> [tool-call]
        tool-result (conj tool-result)))))

(defn- extract-history-messages
  "Walk `(:data message)` in insertion order and emit AI-SDK-message maps for
  history replay. Preserves adjacency of tool calls and their tool results."
  [message]
  (into [] (mapcat tool-part->history-messages) (:data message)))

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
