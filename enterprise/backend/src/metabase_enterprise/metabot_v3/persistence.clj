(ns metabase-enterprise.metabot-v3.persistence
  "Persistence functions for MetaBot conversations and messages."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private history-message-types
  "Message types that should be included in history.
   Excludes TEXT (comes from Slack), DATA (ephemeral for rendering), and FINISH_MESSAGE (metadata only)."
  #{"TOOL_CALL" "TOOL_RESULT"})

(defn- normalize-history-message
  "Normalize a stored message to the format expected by ai-service.
   Keeps only the fields defined in the schema: role, content, tool_calls, tool_call_id."
  [{:keys [role content tool_calls tool_call_id]}]
  (cond-> {:role (keyword role)}
    content      (assoc :content content)
    tool_calls   (assoc :tool_calls tool_calls)
    tool_call_id (assoc :tool_call_id tool_call_id)))

(defn- extract-history-messages
  "Extract messages that should be included in conversation history.
   Filters to TOOL_CALL and TOOL_RESULT types. Normalizes to schema format.
   Preserves original ordering from stored data."
  [message]
  (->> (:data message)
       (filter #(history-message-types (:_type %)))
       (mapv normalize-history-message)))

(defn get-message-history
  "Fetch stored tool call/data history for a set of Slack message IDs.
   Returns a map of {slack-msg-id -> [tool-parts...]}.
   Excludes TEXT messages since those come from Slack (to respect edits)."
  [conversation-id slack-msg-ids]
  (when (seq slack-msg-ids)
    (let [messages (t2/select :model/MetabotMessage
                              :conversation_id conversation-id
                              :role "assistant"
                              :slack_msg_id [:in slack-msg-ids])]
      (log/infof "[persistence] Found %d messages for slack-msg-ids %s" (count messages) (pr-str slack-msg-ids))
      (doseq [m messages]
        (log/infof "[persistence] Message slack_msg_id=%s, data types: %s"
                   (:slack_msg_id m)
                   (pr-str (mapv :_type (:data m)))))
      (->> messages
           (keep (fn [{:keys [slack_msg_id] :as msg}]
                   (when-let [parts (seq (extract-history-messages msg))]
                     [slack_msg_id parts])))
           (into {})))))

(defn store-message!
  "Store messages for a conversation in the database.
   Handles extracting finish/state metadata and persisting to MetabotConversation and MetabotMessage tables.
   slack-msg-id is optional - only provided for Slack-originated messages."
  [conversation-id profile-id messages & {:keys [slack-msg-id]}]
  (let [finish   (let [m (u/last messages)]
                   (when (= (:_type m) :FINISH_MESSAGE)
                     m))
        state    (u/seek #(and (= (:_type %) :DATA)
                               (= (:type %) "state"))
                         messages)
        messages (-> (remove #(or (= % state) (= % finish)) messages)
                     vec)]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (constantly (cond-> {:user_id    api/*current-user-id*}
                                            state (assoc :state state))))
    ;; NOTE: this will need to be constrained at some point, see BOT-386
    (t2/insert! :model/MetabotMessage
                (cond-> {:conversation_id conversation-id
                         :data            messages
                         :usage           (:usage finish)
                         :role            (:role (first messages))
                         :profile_id      profile-id
                         :total_tokens    (->> (vals (:usage finish))
                                               ;; NOTE: this filter is supporting backward-compatible usage format, can be
                                               ;; removed when ai-service does not give us `completionTokens` in `usage`
                                               (filter map?)
                                               (map #(+ (:prompt %) (:completion %)))
                                               (apply +))}
                  slack-msg-id (assoc :slack_msg_id slack-msg-id)))))
