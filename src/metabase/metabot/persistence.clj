(ns metabase.metabot.persistence
  "Persistence for Metabot conversations and messages."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Storage format migration ----------------------------------------

(defn v1-format?
  "Returns true if `data` is in v1 storage format (has separate tool-input/tool-output entries)."
  [data]
  (and (sequential? data)
       (some #(#{"tool-input" "tool-output"} (:type %)) data)))

(defn migrate-v1->v2
  "Migrate a v1 data array to v2 format. Merges separate tool-input/tool-output entries
   into unified tool-{name} parts. Text and user-message blocks pass through unchanged.

   v1: [{:type \"tool-input\" :id \"tc1\" :function \"search\" :arguments {...}}
        {:type \"tool-output\" :id \"tc1\" :result {...}}]
   v2: [{:type \"tool-search\" :toolCallId \"tc1\" :state \"output-available\" :input {...} :output {...}}]"
  [data]
  (let [outputs (->> data
                     (filter #(= "tool-output" (:type %)))
                     (into {} (map (fn [o] [(:id o) o]))))]
    (->> data
         (remove #(= "tool-output" (:type %)))
         (mapv (fn [block]
                 (if (= "tool-input" (:type block))
                   (let [output   (get outputs (:id block))
                         has-err? (some? (:error output))]
                     (cond-> {:type       (str "tool-" (:function block))
                              :toolCallId (:id block)
                              :toolName   (:function block)
                              :state      (cond
                                            has-err?          "error"
                                            (some? output)    "output-available"
                                            :else             "input-available")
                              :input      (:arguments block)}
                       (some? (:result output)) (assoc :output (:result output))
                       has-err?                 (assoc :error (:error output))))
                   block))))))

(defn ensure-current-format
  "Ensure data is in the current (v2) storage format, migrating from v1 if needed."
  [data]
  (if (v1-format? data)
    (migrate-v1->v2 data)
    data))

(defn internal-parts->storable
  "Convert internal agent loop parts to v2 storage format.
   Merges :tool-input/:tool-output pairs into unified tool-{name} entries.

   Internal: [{:type :tool-input :id \"tc1\" :function \"search\" :arguments {...}}
              {:type :tool-output :id \"tc1\" :result {...}}]
   Storable: [{:type \"tool-search\" :toolCallId \"tc1\" :state \"output-available\" :input {...} :output {...}}]"
  [parts]
  (let [outputs (->> parts
                     (filter #(= :tool-output (:type %)))
                     (into {} (map (fn [o] [(:id o) o]))))]
    (->> parts
         (remove #(= :tool-output (:type %)))
         (mapv (fn [part]
                 (case (:type part)
                   :text      {:type "text" :text (:text part)}
                   :tool-input
                   (let [output   (get outputs (:id part))
                         has-err? (some? (:error output))]
                     (cond-> {:type       (str "tool-" (:function part))
                              :toolCallId (:id part)
                              :toolName   (:function part)
                              :state      (cond
                                            has-err?          "error"
                                            (some? output)    "output-available"
                                            :else             "input-available")
                              :input      (:arguments part)}
                       (some? (:result output)) (assoc :output (:result output))
                       has-err?                 (assoc :error (:error output))))
                   :data      {:type (str "data-" (or (:data-type part) "data"))
                               :data (:data part)}
                   ;; Pass through user messages and anything else unchanged
                   (let [m (cond-> {}
                             (:role part) (assoc :role (name (:role part)))
                             (:content part) (assoc :content (:content part))
                             (:type part) (assoc :type (name (:type part)))
                             (:text part) (assoc :text (:text part)))]
                     (if (seq m) m part))))))))

(defn storable->tool-history
  "Extract tool call history entries from v2 storable parts.
   Returns a seq of maps suitable for the slackbot history format."
  [parts]
  (mapcat (fn [block]
            (when (and (string? (:type block))
                       (str/starts-with? (:type block) "tool-"))
              (let [tool-call {:role       "assistant"
                               :tool_calls [{:id        (:toolCallId block)
                                             :name      (:toolName block)
                                             :arguments (if (string? (:input block))
                                                          (:input block)
                                                          (:input block))}]}
                    tool-result (when (#{"output-available" "error"} (:state block))
                                  {:role         "tool"
                                   :tool_call_id (:toolCallId block)
                                   :content      (or (:output block) (some-> (:error block) :message))})]
                (cond-> [tool-call]
                  tool-result (conj tool-result)))))
          parts))

(defn store-message!
  "Persist messages to MetabotConversation and MetabotMessage tables.

  Supports two input formats:
  - Legacy (v1/ai-service): messages with :_type fields (FINISH_MESSAGE, DATA, TEXT, etc.)
  - v2: flat vector of storable parts. When using v2, pass :usage and :role directly."
  [conversation-id profile-id messages & {:keys [slack-msg-id channel-id user-id ai-proxy? usage role]}]
  (let [;; Legacy format detection: look for _type fields
        legacy?  (some :_type messages)
        finish   (when legacy?
                   (let [m (u/last messages)]
                     (when (= (:_type m) :FINISH_MESSAGE) m)))
        state    (when legacy?
                   (u/seek #(and (= (:_type %) :DATA)
                                 (= (:type %) "state"))
                           messages))
        data     (if legacy?
                   (-> (remove #(or (= % state) (= % finish)) messages) vec)
                   (vec messages))
        usage    (or usage (:usage finish))
        role     (or role (:role (first messages)))]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (constantly (cond-> {:user_id api/*current-user-id*}
                                            state (assoc :state state))))
    ;; NOTE: this will need to be constrained at some point, see BOT-386
    (t2/insert-returning-pk! :model/MetabotMessage
                             (cond-> {:conversation_id conversation-id
                                      :data            data
                                      :usage           usage
                                      :role            role
                                      :profile_id      profile-id
                                      :total_tokens    (->> (vals usage)
                                                            (filter map?)
                                                            (map #(+ (:prompt %) (:completion %)))
                                                            (apply +))
                                      :ai_proxied      (boolean ai-proxy?)}
                               channel-id   (assoc :channel_id channel-id)
                               slack-msg-id (assoc :slack_msg_id slack-msg-id)
                               user-id      (assoc :user_id user-id)))))

(defn set-response-slack-msg-id!
  "Backfill slack_msg_id on a MetabotMessage by primary key."
  [msg-id slack-msg-id]
  (when (and msg-id slack-msg-id)
    (t2/update! :model/MetabotMessage msg-id {:slack_msg_id slack-msg-id})))
