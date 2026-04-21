(ns metabase.metabot.persistence
  "Persistence for Metabot conversations and messages."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn store-message!
  "Persist messages to MetabotConversation and MetabotMessage tables."
  [conversation-id profile-id messages & {:keys [slack-msg-id channel-id slack-team-id slack-thread-ts user-id ai-proxy?]}]
  (let [finish   (let [m (u/last messages)]
                   (when (= (:_type m) :FINISH_MESSAGE)
                     m))
        state    (u/seek #(and (= (:_type %) :DATA)
                               (= (:type %) "state"))
                         messages)
        messages (-> (remove #(or (= % state) (= % finish)) messages)
                     vec)]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (constantly (cond-> {:user_id api/*current-user-id*}
                                            state           (assoc :state state)
                                            slack-team-id   (assoc :slack_team_id slack-team-id)
                                            channel-id      (assoc :slack_channel_id channel-id)
                                            slack-thread-ts (assoc :slack_thread_ts slack-thread-ts))))
    ;; NOTE: this will need to be constrained at some point, see BOT-386
    (t2/insert-returning-pk! :model/MetabotMessage
                             (cond-> {:conversation_id conversation-id
                                      :data            messages
                                      :usage           (:usage finish)
                                      :role            (:role (first messages))
                                      :profile_id      profile-id
                                      :external_id     (str (random-uuid))
                                      :total_tokens    (->> (vals (:usage finish))
                                                            ;; NOTE: this filter is supporting backward-compatible usage format, can be
                                                            ;; removed when ai-service does not give us `completionTokens` in `usage`
                                                            (filter map?)
                                                            (map #(+ (:prompt %) (:completion %)))
                                                            (apply +))
                                      :ai_proxied (boolean ai-proxy?)}
                               channel-id   (assoc :channel_id channel-id)
                               slack-msg-id (assoc :slack_msg_id slack-msg-id)
                               user-id      (assoc :user_id user-id)))))

(defn set-response-slack-msg-id!
  "Backfill slack_msg_id on a MetabotMessage by primary key."
  [msg-id slack-msg-id]
  (when (and msg-id slack-msg-id)
    (t2/update! :model/MetabotMessage msg-id {:slack_msg_id slack-msg-id})))

;;; ---------------------------------------- Chat message conversion ----------------------------------------

(defn- convert-content-block
  "Convert a single raw content block from `:data` into a frontend `MetabotChatMessage` map.
   Returns nil for blocks that should be skipped (tool-output, unknown types).

   `external-id` (the parent row's `metabot_message.external_id`) is attached to
   agent-text chat messages as `:externalId` — the stable key for feedback and
   jump-to-message links; the per-block `:id` stays unique."
  [external-id block]
  (let [block-type (:type block)
        block-role (:role block)]
    (cond
      ;; User text: {:role "user" :content "..."}
      (= "user" block-role)
      {:id (str (random-uuid)) :role "user" :type "text" :message (:content block)}

      ;; Assistant text (standard): {:type "text" :text "..."}
      (= "text" block-type)
      (cond-> {:id (or (:id block) (str (random-uuid)))
               :role "agent"
               :type "text"
               :message (:text block)}
        external-id (assoc :externalId external-id))

      ;; Assistant text (slack format): {:role "assistant" :_type "TEXT" :content "..."}
      (and (= "assistant" block-role) (= "TEXT" (:_type block)))
      (cond-> {:id (str (random-uuid))
               :role "agent"
               :type "text"
               :message (:content block)}
        external-id (assoc :externalId external-id))

      ;; Tool input: {:type "tool-input" :id "..." :function "..." :arguments {...}}
      (= "tool-input" block-type)
      {:id     (:id block)
       :role   "agent"
       :type   "tool_call"
       :name   (:function block)
       :args   (when-let [a (:arguments block)] (json/encode a))
       :status "ended"}

      ;; Tool output — skip here, merged via merge-tool-results
      ;; Data parts — skip for now
      :else nil)))

(defn- merge-tool-results
  "Merge tool-output blocks into their matching tool_call chat messages."
  [chat-messages blocks]
  (let [result-map (->> blocks
                        (filter #(= "tool-output" (:type %)))
                        (into {} (map (fn [o]
                                        [(:id o)
                                         {:result   (when-let [r (:result o)] (json/encode r))
                                          :is_error (boolean (:error o))}]))))]
    (mapv (fn [msg]
            (if-let [r (and (= "tool_call" (:type msg)) (get result-map (:id msg)))]
              (merge msg r)
              msg))
          chat-messages)))

(defn message->chat-messages
  "Convert a single `MetabotMessage` model instance into a seq of `MetabotChatMessage` maps.
   Each message's `:data` (vector of content blocks) is flattened into typed chat messages."
  [message]
  (let [blocks       (or (:data message) [])
        external-id  (:external_id message)
        chat-msgs    (into [] (keep #(convert-content-block external-id %)) blocks)]
    (merge-tool-results chat-msgs blocks)))

(defn messages->chat-messages
  "Convert a seq of `MetabotMessage` model instances into a flat `MetabotChatMessage` vector."
  [messages]
  (into [] (mapcat message->chat-messages) messages))
