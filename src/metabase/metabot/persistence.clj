(ns metabase.metabot.persistence
  "Persistence for Metabot conversations and messages."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Storage format migration ----------------------------------------

(defn- v1a?
  "Returns true if `data` is in v1a storage format — the earlier ai-service origin
   shape whose entries carry `:_type` fields (e.g. `FINISH_MESSAGE`, `DATA`,
   `TOOL_CALL`, `TOOL_RESULT`)."
  [data]
  (and (sequential? data)
       (some :_type data)))

(defn- v1b?
  "Returns true if `data` is in v1 storage format (has separate tool-input/tool-output entries)."
  [data]
  (and (sequential? data)
       (some #(#{"tool-input" "tool-output"} (:type %)) data)))

(defn- v1-user-message?
  "Returns true if `data` is the user-message shape that was backfilled to `data_version = 1`
   when that column was introduced. These rows were written as `[{:role \"user\" :content \"…\"}]`
   (already valid v2) and need no transformation — only an identity passthrough."
  [data]
  (and (sequential? data)
       (seq data)
       (every? #(and (= "user" (:role %))
                     (string? (:content %))
                     (nil? (:_type %)))
               data)))

(defn normalize-data-event-types
  "Replace underscores with hyphens in data event type names.
   E.g. \"data-navigate_to\" -> \"data-navigate-to\".
   Idempotent: already-hyphenated types pass through unchanged."
  [data]
  (mapv (fn [entry]
          (if (and (string? (:type entry))
                   (str/starts-with? (:type entry) "data-"))
            (update entry :type #(str/replace % "_" "-"))
            entry))
        data))

(defn- v1a-tool-call->parts
  "Split one v1a `TOOL_CALL` entry (which may batch multiple calls) into v2 tool parts,
   paired with matching results from `outputs` (keyed by `:tool_call_id`)."
  [{:keys [tool_calls]} outputs]
  (mapv (fn [{:keys [id name arguments]}]
          (let [output (get outputs id)
                input  (try (json/decode+kw arguments)
                            (catch Throwable _ arguments))]
            (cond-> {:type       (str "tool-" name)
                     :toolCallId id
                     :toolName   name
                     :state      (if output "output-available" "input-available")
                     :input      input}
              output (assoc :output (:content output)))))
        tool_calls))

(defn migrate-v1a->v2
  "Migrate a v1a data array (ai-service origin, `:_type`-keyed) to v2 format.

   Entry conversions:
   - TEXT       -> {:type \"text\" :text <content>}
   - ERROR      -> {:type \"error\" :errorText <content>} (matches AI SDK ErrorChunk)
   - TOOL_CALL  -> one `tool-<name>` part per batched call, merged with matching TOOL_RESULT
   - TOOL_RESULT -> stripped from output; merged into its paired TOOL_CALL
   - DATA       -> {:type \"data-<type>\" :data <:value>}, `normalize-data-event-types` applied

   v1a: [{:role \"assistant\" :_type \"TOOL_CALL\" :tool_calls [{:id \"tc1\" :name \"search\" :arguments \"{…}\"}]}
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
                     "TOOL_CALL" (v1a-tool-call->parts entry outputs)
                     "DATA"      [{:type (str "data-" (:type entry))
                                   :data (:value entry)}]
                     (throw (ex-info "Unrecognized v1a entry type" {:entry entry})))))
         vec
         normalize-data-event-types)))

(defn migrate-v1b->v2
  "Migrate a v1b data array (native-agent origin, `:type`-keyed) to v2 format.
   Merges separate tool-input/tool-output entries into unified tool-{name} parts.
   Text and user-message blocks pass through unchanged. Also normalizes data event
   type names from underscore to kebab-case.

   v1b: [{:type \"tool-input\" :id \"tc1\" :function \"search\" :arguments {...}}
         {:type \"tool-output\" :id \"tc1\" :result {...}}]
   v2:  [{:type \"tool-search\" :toolCallId \"tc1\" :state \"output-available\" :input {...} :output {...}}]"
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
                   block)))
         normalize-data-event-types)))

(defn migrate-v1->v2
  "Migrate a v1 data array to v2 format. Dispatches to `migrate-v1a->v2` or
   `migrate-v1b->v2` based on the detected shape. `v1-user-message?` rows are already
   valid v2 shape (backfilled to `data_version = 1`) and pass through unchanged.
   Throws on any other shape."
  [data]
  (cond
    (v1a? data)             (migrate-v1a->v2 data)
    (v1b? data)             (migrate-v1b->v2 data)
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

  `:start`/`:finish`/`:usage` are stream lifecycle/metadata;
  `:data` is surfaced via a separate column; `:tool-input-start` is
  the eager signal whose content is fully contained in the final
  `:tool-input` part."
  #{:start :usage :finish :data :tool-input-start})

(defn parts->storable-content
  "Drop transient/lifecycle parts and convert what remains to v2 storage format."
  [parts]
  (->> parts
       (remove #(non-storable-part-types (:type %)))
       internal-parts->storable))

(defn storable->tool-history
  "Extract tool call history entries from v2 storable parts.
   Returns a seq of maps suitable for the slackbot history format."
  [parts]
  (mapcat (fn [block]
            (when (and (string? (:type block))
                       (str/starts-with? (:type block) "tool-"))
              (let [tool-call {:role       :assistant
                               :tool_calls [{:id        (:toolCallId block)
                                             :name      (:toolName block)
                                             :arguments (if (string? (:input block))
                                                          (:input block)
                                                          (json/encode (:input block)))}]}
                    tool-result (when (#{"output-available" "error"} (:state block))
                                  {:role         :tool
                                   :tool_call_id (:toolCallId block)
                                   :content      (or (:output block) (some-> (:error block) :message))})]
                (cond-> [tool-call]
                  tool-result (conj tool-result)))))
          parts))

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
