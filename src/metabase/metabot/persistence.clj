(ns metabase.metabot.persistence
  "Persistence for Metabot conversations and messages."
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn extract-usage
  "Extract usage from parts, taking the last `:usage` per model.

  The agent loop emits cumulative usage — each `:usage` part subsumes all prior
  usage for that model — so we simply take the last one per model rather than
  summing. Returns a map keyed by model name:
  {\"model-name\" {:prompt X :completion Y}}"
  [parts]
  (transduce
   (filter #(= :usage (:type %)))
   (completing
    (fn [acc {:keys [usage model]}]
      (let [model (or model "unknown")]
        (assoc acc model {:prompt     (:promptTokens usage 0)
                          :completion (:completionTokens usage 0)}))))
   {}
   parts))

(defn strip-tool-output-bloat
  "For :tool-output parts, keep only :output in the result map.
  Both LLM adapters only read (get-in part [:result :output]) when replaying history.
  Everything else (:structured-output, :resources, :data-parts, :reactions, etc.)
  is transient runtime data consumed during streaming and can be very large."
  [{:keys [type] :as part}]
  (cond-> part
    (= :tool-output type) (update :result select-keys [:output])))

(defn combine-text-parts-xf
  "Transducer that merges consecutive `:text` parts into a single `:text` part.
  Non-text parts pass through unchanged. Used before persistence so streaming
  text deltas consolidate into one stored block."
  []
  (fn [rf]
    (let [pending (volatile! nil)]
      (fn
        ([] (rf))
        ([result]
         (let [p @pending]
           (rf (if p (rf result p) result))))
        ([result part]
         (let [prev @pending]
           (if (and prev (= :text (:type prev) (:type part)))
             (do (vswap! pending update :text str (:text part))
                 result)
             (do (vreset! pending part)
                 (if prev (rf result prev) result)))))))))

(defn store-native-parts!
  "Store assistant response parts directly to the database in native format.

  Takes raw AI SDK parts (ideally after `combine-text-parts-xf` merging) and
  stores them without the lossy AI-SDK-line round-trip used by `store-message!`.
  Returns the inserted MetabotMessage primary key.

  Kwargs (all optional):
  - `:channel-id`, `:slack-msg-id` — slackbot metadata stamped on the message row
  - `:user-id` — user id for the message row (defaults to omitted)
  - `:ai-proxy?` — explicit override; otherwise derived from `llm-metabot-provider`"
  [conversation-id profile-id parts & {:keys [channel-id slack-msg-id user-id ai-proxy?]}]
  (let [state-part (u/seek #(and (= :data (:type %))
                                 (= "state" (:data-type %)))
                           parts)
        usage      (extract-usage parts)
        ai-proxy?  (if (some? ai-proxy?)
                     ai-proxy?
                     (provider-util/metabase-provider? (metabot.settings/llm-metabot-provider)))
        ;; Filter out :start, :usage, :finish stream metadata. Data parts are
        ;; persisted (so the analytics view can surface them) except :state,
        ;; which is saved to MetabotConversation.state above.
        content    (->> parts
                        (remove #(#{:start :usage :finish} (:type %)))
                        (filter streaming/persistable-data-part?)
                        (mapv strip-tool-output-bloat))]
    (prometheus/observe! :metabase-metabot/message-persist-bytes
                         {:profile-id (or profile-id "unknown")}
                         (u/string-byte-count (json/encode content)))
    (t2/with-transaction [_conn]
      (when state-part
        (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                                  (constantly {:user_id api/*current-user-id*
                                               :state   (:data state-part)})))
      (t2/insert-returning-pk! :model/MetabotMessage
                               (cond-> {:conversation_id conversation-id
                                        :data            content
                                        :usage           usage
                                        :role            :assistant
                                        :profile_id      profile-id
                                        :total_tokens    (->> (vals usage)
                                                              (map #(+ (:prompt %) (:completion %)))
                                                              (reduce + 0))
                                        :ai_proxied      (boolean ai-proxy?)}
                                 channel-id   (assoc :channel_id channel-id)
                                 slack-msg-id (assoc :slack_msg_id slack-msg-id)
                                 user-id      (assoc :user_id user-id))))))

(defn store-message!
  "Persist messages to MetabotConversation and MetabotMessage tables."
  [conversation-id profile-id messages & {:keys [slack-msg-id channel-id user-id ai-proxy?]}]
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
    (t2/insert-returning-pk! :model/MetabotMessage
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
