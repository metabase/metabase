(ns metabase.slackbot.persistence
  "Slack-specific persistence: reconstruct conversation history from stored messages."
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- storable->tool-history
  "Extract tool call history entries from v2 storable parts (AI SDK UIMessage `ToolUIPart`
   shape: `:type \"tool-<toolName>\"` with `:state` and merged `:input`/`:output`).
   Skips `input-available` entries (tool still running — no result to send yet)."
  [parts]
  (mapcat (fn [block]
            (when (and (string? (:type block))
                       (str/starts-with? (:type block) "tool-")
                       (not= "input-available" (:state block)))
              (let [tool-call {:role       :assistant
                               :tool_calls [{:id        (:toolCallId block)
                                             :name      (:toolName block)
                                             :arguments (if (string? (:input block))
                                                          (:input block)
                                                          (json/encode (:input block)))}]}
                    tool-result (when (#{"output-available" "output-error"} (:state block))
                                  {:role         :tool
                                   :tool_call_id (:toolCallId block)
                                   :content      (or (:output block)
                                                     (:errorText block)
                                                     "Tool execution failed")})]
                (cond-> [tool-call]
                  tool-result (conj tool-result)))))
          parts))

(defn message-history
  "Tool call history for Slack messages. Returns {slack-msg-id -> [messages...]}."
  [conversation-id slack-msg-ids]
  (when (seq slack-msg-ids)
    (->> (t2/select :model/MetabotMessage
                    :conversation_id conversation-id
                    :role "assistant"
                    :deleted_at nil
                    :slack_msg_id [:in slack-msg-ids])
         (keep (fn [{:keys [slack_msg_id data]}]
                 (when-let [parts (seq (storable->tool-history data))]
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
