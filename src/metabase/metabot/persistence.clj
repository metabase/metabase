(ns metabase.metabot.persistence
  "Persistence for Metabot conversations and messages."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Storage format migration ----------------------------------------

(defn- v1-external-ai-service?
  "Returns true if `data` is in v1-external-ai-service storage format — the earlier
   ai-service origin shape whose entries carry `:_type` fields (e.g. `FINISH_MESSAGE`,
   `DATA`, `TOOL_CALL`, `TOOL_RESULT`)."
  [data]
  (and (sequential? data)
       (some :_type data)))

(defn- v1-native?
  "Returns true if `data` is in v1-native storage format (has separate tool-input/tool-output entries)."
  [data]
  (and (sequential? data)
       (some #(#{"tool-input" "tool-output"} (:type %)) data)))

(defn- v1-user-message?
  "Returns true if `data` is a user message written as `data_version = 1`. User messages
   were always stored in the same format regardless of v1-external-ai-service vs v1-native,
   and that format is already valid v2 — passthrough only."
  [data]
  (and (sequential? data)
       (seq data)
       (every? #(and (= "user" (:role %))
                     (string? (:content %))
                     (nil? (:_type %)))
               data)))

(defn- v1-external-ai-service-tool-call->parts
  "Split one v1-external-ai-service `TOOL_CALL` entry (which may batch multiple calls)
   into v2 tool parts, paired with matching results from `outputs` (keyed by `:tool_call_id`)."
  [{:keys [tool_calls]} outputs]
  (mapv (fn [{:keys [id name arguments]}]
          (let [output (get outputs id)
                input  (try (json/decode+kw arguments)
                            (catch Throwable _ arguments))]
            (cond-> {:type       (str "tool-" (str/replace name "_" "-"))
                     :toolCallId id
                     :toolName   name
                     :state      (if output "output-available" "input-available")
                     :input      input}
              output (assoc :output (:content output)))))
        tool_calls))

(defn migrate-v1-external-ai-service->v2
  "Migrate a v1-external-ai-service data array (ai-service origin, `:_type`-keyed) to v2 format.

   Entry conversions:
   - TEXT       -> {:type \"text\" :text <content>}
   - ERROR      -> {:type \"error\" :errorText <content>} (matches AI SDK ErrorChunk)
   - TOOL_CALL  -> one `tool-<name>` part per batched call, merged with matching TOOL_RESULT
   - TOOL_RESULT -> stripped from output; merged into its paired TOOL_CALL
   - DATA       -> {:type \"data-<type>\" :data <:value>}

   v1-external-ai-service:
     [{:role \"assistant\" :_type \"TOOL_CALL\" :tool_calls [{:id \"tc1\" :name \"search\" :arguments \"{…}\"}]}
      {:role \"tool\"      :_type \"TOOL_RESULT\" :tool_call_id \"tc1\" :content \"…\"}
      {:_type \"DATA\" :type \"navigate_to\" :version 1 :value \"/q/1\"}]"
  [data]
  (let [outputs (->> data
                     (filter #(= "TOOL_RESULT" (:_type %)))
                     (into {} (map (juxt :tool_call_id identity))))]
    (->> data
         (remove #(= "TOOL_RESULT" (:_type %)))
         (mapcat (fn [entry]
                   (case (:_type entry)
                     "TEXT"      [{:type "text" :text (:content entry)}]
                     "ERROR"     [{:type "error" :errorText (:content entry)}]
                     "TOOL_CALL" (v1-external-ai-service-tool-call->parts entry outputs)
                     "DATA"      [{:type (str "data-" (str/replace (:type entry) "_" "-"))
                                   :data (:value entry)}]
                     (throw (ex-info "Unrecognized v1-external-ai-service entry type" {:entry entry})))))
         vec)))

(defn migrate-v1-native->v2
  "Migrate a v1-native data array (native-agent origin, `:type`-keyed) to v2 format.
   Merges separate tool-input/tool-output entries into unified tool-{name} parts.
   Text and user-message blocks pass through unchanged. Underscores in tool names
   are kebab-cased inline.

   v1-native: [{:type \"tool-input\" :id \"tc1\" :function \"search\" :arguments {...}}
               {:type \"tool-output\" :id \"tc1\" :result {...}}]
   v2:        [{:type \"tool-search\" :toolCallId \"tc1\" :state \"output-available\" :input {...} :output {...}}]"
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
                     (cond-> {:type       (str "tool-" (str/replace (:function block) "_" "-"))
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

(defn migrate-v1->v2
  "Migrate a v1 data array to v2 format. Dispatches to `migrate-v1-external-ai-service->v2`
   or `migrate-v1-native->v2` based on the detected shape. `v1-user-message?` rows are
   already valid v2 shape (backfilled to `data_version = 1`) and pass through unchanged.
   Throws on any other shape."
  [data]
  (cond
    (v1-external-ai-service? data) (migrate-v1-external-ai-service->v2 data)
    (v1-native? data)              (migrate-v1-native->v2 data)
    (v1-user-message? data) data
    :else                   (throw (ex-info "Unrecognized v1 storage format" {:data data}))))

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

(def ^:private non-storable-part-types
  "Transient parts that are not persisted in message history.

  stream lifecycle and step boundaries (`:start`, `:finish`, `:start-step`,
  `:finish-step`, `:abort`) are control-flow signals with no history value.
  `:usage` and `:message-metadata` carry token/metadata that live in the
  dedicated `usage` column instead. `:tool-input-start` is the eager signal
  whose content is fully contained in the final `:tool-input` part.
  `:data` parts are not persisted yet — they will be stored in a future
  change, but today they are dropped."
  #{:start :start-step :finish :finish-step :abort :usage :message-metadata :data :tool-input-start})

(defn parts->storable-content
  "Drop transient/lifecycle parts and convert what remains to v2 storage format."
  [parts]
  (->> parts
       (remove #(non-storable-part-types (:type %)))
       internal-parts->storable))

(defn store-message!
  "Persist messages to MetabotConversation and MetabotMessage tables.

  `messages` is a flat vector of storable parts — either a single user message
  `[{:role :user :content \"...\"}]` or the output of `parts->storable-content`
  for an assistant turn. For assistant turns, pass `:usage` and `:role` directly;
  for user turns, `:role` is inferred from the first message."
  [conversation-id profile-id messages & {:keys [slack-msg-id channel-id user-id ai-proxy? usage role]}]
  (let [data (vec messages)
        role (or role (:role (first messages)))]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (constantly {:user_id api/*current-user-id*}))
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
                                      :ai_proxied      (boolean ai-proxy?)
                                      :data_version    2}
                               channel-id   (assoc :channel_id channel-id)
                               slack-msg-id (assoc :slack_msg_id slack-msg-id)
                               user-id      (assoc :user_id user-id)))))

(defn set-response-slack-msg-id!
  "Backfill slack_msg_id on a MetabotMessage by primary key."
  [msg-id slack-msg-id]
  (when (and msg-id slack-msg-id)
    (t2/update! :model/MetabotMessage msg-id {:slack_msg_id slack-msg-id})))
