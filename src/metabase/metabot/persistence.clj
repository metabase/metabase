(ns metabase.metabot.persistence
  "Persistence for Metabot conversations and messages."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDateTime OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(def persisted-structured-output-keys
  "Subset of `:structured-output` that must survive persistence so
  `metabase-enterprise.metabot-analytics.queries` can surface generated
  queries on the admin detail page."
  [:query-id :query-content :query :database :chart-type])

(defn- trim-structured-output [structured]
  (when (map? structured)
    (not-empty (select-keys structured persisted-structured-output-keys))))

(defn strip-tool-output-bloat
  "For :tool-output parts, keep `:output` and a trimmed `:structured-output` in
  the result map. Both LLM adapters only read `(get-in part [:result :output])`
  when replaying history, so `:output` is all they need. The analytics extractor,
  however, reads a small subset of `:structured-output` off persisted messages
  (see `persisted-structured-output-keys`), so we keep those four keys and drop
  everything else (`:resources`, `:data-parts`, `:reactions`, …) — that's where
  the bulk of the bloat lives."
  [{:keys [type] :as part}]
  (if (= :tool-output type)
    (update part :result
            (fn [r]
              (cond-> (select-keys r [:output])
                (trim-structured-output (:structured-output r))
                (assoc :structured-output (trim-structured-output (:structured-output r)))
                (trim-structured-output (:structured_output r))
                (assoc :structured_output (trim-structured-output (:structured_output r))))))
    part))

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

(defn throwable->error-payload
  "Coerce a `Throwable` into the same JSON-encodable map shape a streamed
  `:error` part carries, so a turn that fails by *throwing* persists in the
  same column shape as one that fails by emitting an `:error` part."
  [^Throwable t]
  (let [data (ex-data t)]
    (cond-> {:message (or (ex-message t) (.toString t))
             :type    (.getName (class t))}
      (seq data) (assoc :data data))))

(defn- safe-encode-error
  "JSON-encode an error payload, falling back to a stringified `:data` if the
  first encode throws. Defense-in-depth: `metabase.server.middleware.json`
  registers an `Object` `.toString` fallback encoder that handles most odd
  values, but in contexts where that middleware hasn't been loaded — early
  init, certain unit-test setups — an unusual `ex-data` value could still
  throw. We'd rather persist a stringified payload than fail the whole UPDATE
  and lose the row's error column to `nil`."
  [error]
  (when (some? error)
    (try (json/encode error)
         (catch Throwable _
           (try (json/encode (cond-> error
                               (map? error) (assoc :data (pr-str (:data error)))))
                (catch Throwable _
                  (json/encode {:message      (pr-str error)
                                :encode-error true})))))))

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

(defn start-turn!
  "Atomically begin a turn: upsert the conversation row, insert the user-message row,
  and insert a placeholder assistant row. The placeholder's `created_at` is pinned
  at turn start, so a retry submitted later cannot interleave its rows ahead of an
  earlier turn's assistant reply when reads sort by `created_at`.

  Positional args: `conversation-id`, `profile-id`, `user-message` (a single message
  map matching the existing `:data` block shape, e.g. `{:role \"user\" :content ...}`).

  Keyword args:
  - `:hostname` — always-on `embedding_hostname`; recorded on conversation insert only.
  - `:pii-info` — gated PII map (`analytics.core/pii-fields-from`'s shape: keys
     `:embedding_path`, `:user_agent`, `:sanitized_user_agent`, `:ip_address`).
     Nil when the retention flag is off; individual keys recorded on first
     insert only. Slack persistence never passes this — slack rows stay NULL.
  - `:slack-msg-id`, `:channel-id`, `:slack-team-id`, `:slack-thread-ts` — slack
     metadata. `:slack-team-id`/`:channel-id`/`:slack-thread-ts` land on the
     conversation row on first insert only; `:slack-msg-id`/`:channel-id` land on
     the user-message row.
  - `:user-id` — the turn's originator. Lands on the user-message row's
     `user_id` and (on first insert) on the conversation row's `user_id`. Also
     lands on the assistant placeholder row when explicitly passed — slackbot
     uses this for per-row attribution in multi-user threads; the web UI omits
     it so the assistant row's `user_id` stays NULL. Falls back to
     `api/*current-user-id*` when omitted.
  - `:ai-proxy?` — override; otherwise derived from `llm-metabot-provider`.

  Returns `{:assistant-msg-id <pk> :assistant-external-id <uuid-str>}`."
  [conversation-id profile-id user-message
   & {:keys [hostname pii-info
             channel-id slack-msg-id slack-team-id slack-thread-ts
             user-id ai-proxy?]}]
  (let [;; Originator: explicit `:user-id` wins; otherwise fall back to the
        ;; auth-bound dynamic. Used for both the conversation `user_id` (on
        ;; first insert) and the user-message row's `user_id`.
        originator-id          (or user-id api/*current-user-id*)
        ai-proxy?              (if (some? ai-proxy?)
                                 ai-proxy?
                                 (provider-util/metabase-provider? (metabot.settings/llm-metabot-provider)))
        assistant-external-id  (str (random-uuid))]
    (analytics/inc! :metabase-metabot/turn-started
                    {:profile-id (or profile-id "unknown")})
    ;; The user-message and assistant-placeholder rows share `created_at` because
    ;; the column default resolves to `transaction_timestamp()`. Readers ordering
    ;; metabot_message rows for chat-detail rendering must tiebreak on `:id`
    (t2/with-transaction [_conn]
      (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                                (fn [existing]
                                  ;; `:user_id` is the originator — set on insert, never overwritten.
                                  (cond-> {}
                                    (nil? existing)
                                    (assoc :user_id originator-id)
                                    (and hostname (nil? (:embedding_hostname existing)))
                                    (assoc :embedding_hostname hostname)
                                    (and (:embedding_path pii-info) (nil? (:embedding_path existing)))
                                    (assoc :embedding_path (:embedding_path pii-info))
                                    (and (:user_agent pii-info) (nil? (:user_agent existing)))
                                    (assoc :user_agent (:user_agent pii-info))
                                    (and (:sanitized_user_agent pii-info) (nil? (:sanitized_user_agent existing)))
                                    (assoc :sanitized_user_agent (:sanitized_user_agent pii-info))
                                    (and (:ip_address pii-info) (nil? (:ip_address existing)))
                                    (assoc :ip_address (:ip_address pii-info))
                                    (and slack-team-id (nil? (:slack_team_id existing)))
                                    (assoc :slack_team_id slack-team-id)
                                    (and channel-id (nil? (:slack_channel_id existing)))
                                    (assoc :slack_channel_id channel-id)
                                    (and slack-thread-ts (nil? (:slack_thread_ts existing)))
                                    (assoc :slack_thread_ts slack-thread-ts))))
      (t2/insert! :model/MetabotMessage
                  (cond-> {:conversation_id conversation-id
                           :data            [user-message]
                           :role            :user
                           :profile_id      profile-id
                           :external_id     (str (random-uuid))
                           :total_tokens    0
                           :ai_proxied      (boolean ai-proxy?)}
                    originator-id (assoc :user_id originator-id)
                    channel-id    (assoc :channel_id channel-id)
                    slack-msg-id  (assoc :slack_msg_id slack-msg-id)))
      ;; `:finished nil` is the in-flight marker; `finalize-assistant-turn!`
      ;; UPDATEs to true (success/error) or false (aborted).
      (let [pk (t2/insert-returning-pk!
                :model/MetabotMessage
                (cond-> {:conversation_id conversation-id
                         :data            []
                         :role            :assistant
                         :profile_id      profile-id
                         :external_id     assistant-external-id
                         :total_tokens    0
                         :ai_proxied      (boolean ai-proxy?)
                         :finished        nil}
                  user-id    (assoc :user_id user-id)
                  channel-id (assoc :channel_id channel-id)))]
        {:assistant-msg-id      pk
         :assistant-external-id assistant-external-id}))))

(defn finalize-assistant-turn!
  "UPDATE the placeholder assistant row created by [[start-turn!]] with the final
  streamed parts. Also writes a fresh `state` value to the conversation row when
  a state data part is present in `parts`.

  `parts` should be the post-[[combine-text-parts-xf]] parts vector. Stream metadata
  (`:start`/`:usage`/`:finish`/`:error`) is filtered out before storage; usage is
  accumulated separately into the `usage` column; the error part body, if any,
  is captured into the `error` column via the `:error` kwarg.

  Keyword args:
  - `:profile-id` — same value passed to [[start-turn!]]; tags the
     `message-persist-bytes` histogram. Defaults to `\"unknown\"` so callers
     without a profile (e.g. test helpers) don't fail.
  - `:finished?` — boolean (default true). Set `false` only for client-aborted
     turns; either way the placeholder's `:finished` flips from NULL to a
     concrete boolean so it stops being filtered as in-flight.
  - `:error` — JSON-serializable error payload; encoded into the `error` column.
  - `:slack-msg-id`, `:channel-id` — backfill onto the assistant row when known
     at completion (Slack response posts mid-stream)."
  [conversation-id assistant-msg-id parts
   & {:keys [profile-id finished? error slack-msg-id channel-id]
      :or   {finished? true}}]
  (let [state-part (u/seek #(and (= :data (:type %))
                                 (= "state" (:data-type %)))
                           parts)
        usage      (extract-usage parts)
        content    (->> parts
                        (remove #(#{:start :usage :finish :error} (:type %)))
                        (filter streaming/persistable-data-part?)
                        (mapv strip-tool-output-bloat))]
    (analytics/observe! :metabase-metabot/message-persist-bytes
                        {:profile-id (or profile-id "unknown")}
                        (u/string-byte-count (json/encode content)))
    (t2/with-transaction [_conn]
      (when state-part
        (t2/update! :model/MetabotConversation conversation-id
                    {:state (:data state-part)}))
      (t2/update! :model/MetabotMessage assistant-msg-id
                  (cond-> {:data         content
                           :usage        usage
                           :total_tokens (->> (vals usage)
                                              (map #(+ (:prompt %) (:completion %)))
                                              (reduce + 0))
                           :finished     (boolean finished?)
                           :error        (safe-encode-error error)}
                    slack-msg-id (assoc :slack_msg_id slack-msg-id)
                    channel-id   (assoc :channel_id channel-id))))))

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
   agent text and data part chat messages as `:externalId` — the stable key for
   feedback; the per-block `:id` stays unique."
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

      ;; Data part: {:type "data" :data-type "navigate_to" :version 1 :data ...}
      (= "data" block-type)
      (cond-> {:id   (str (random-uuid))
               :role "agent"
               :type "data_part"
               :part {:type    (:data-type block)
                      :version (or (:version block) 1)
                      :value   (:data block)}}
        external-id (assoc :externalId external-id))

      ;; Tool output — skip here, merged via merge-tool-results
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

(defn- decode-error
  "JSON-decode a row's `:error` column value (a string written by
  `finalize-assistant-turn!`). Falls back to the raw value if it's not a JSON object."
  [error]
  (if (string? error)
    (try (json/decode+kw error)
         (catch Exception _ error))
    error))

;; TODO (sloansparger 2026-05-12) -- chat_messages should be replaced with turns
;; so that we have a higher-level abstraction to annotate. this is fine, but a
;; bit of a hack.
(defn- annotate-agent-messages
  "Stamp `:finished` and `:error` from the parent row onto the
  *last* agent-role chat message produced from it. The annotation describes the
  row's outcome, so it belongs on a single message — the FE expands it into a
  trailing `turn_aborted` / `turn_errored` chat message.

  Parent `:finished nil` (stale placeholder past the grace window) becomes
  `:finished false` so the FE renders it as aborted."
  [chat-messages message]
  (let [finished       (if (contains? message :finished)
                         (or (:finished message) false)
                         true)
        decoded-error  (some-> (:error message) decode-error)
        last-agent-idx (->> chat-messages
                            (keep-indexed (fn [i m] (when (= "agent" (:role m)) i)))
                            last)]
    (if (nil? last-agent-idx)
      chat-messages
      (update chat-messages last-agent-idx
              (fn [m]
                (cond-> (assoc m :finished finished)
                  (some? decoded-error) (assoc :error decoded-error)))))))

(defn- empty-agent-placeholder
  "Stub chat message for an assistant row whose `:data` produced no chat messages
  (typical for errored turns where the agent failed before emitting any text/
  tool parts). Without this the FE has nowhere to render the error alert."
  [{:keys [external_id]}]
  (cond-> {:id      (or external_id (str (random-uuid)))
           :role    "agent"
           :type    "text"
           :message ""}
    external_id (assoc :externalId external_id)))

(defn message->chat-messages
  "Convert a single `MetabotMessage` model instance into a seq of `MetabotChatMessage` maps.
   Each message's `:data` (vector of content blocks) is flattened into typed chat messages.
   Assistant rows that produced zero chat messages but carry `:error`,
   `:finished false`, or `:finished nil` (a stale placeholder past the grace
   window) get a synthetic empty text message so the FE has something to render
   the alert on."
  [message]
  (let [blocks       (or (:data message) [])
        external-id  (:external_id message)
        chat-msgs    (into [] (keep #(convert-content-block external-id %)) blocks)
        merged       (merge-tool-results chat-msgs blocks)
        ;; Absent :finished is treated as true (success); only explicit nil
        ;; (stale placeholder) or false (aborted) should drive the stub branch.
        not-finished (and (contains? message :finished)
                          (not (true? (:finished message))))
        with-stub    (if (and (= :assistant (:role message))
                              (empty? merged)
                              (or (some? (:error message)) not-finished))
                       [(empty-agent-placeholder message)]
                       merged)]
    (annotate-agent-messages with-stub message)))

(defn- errored-agent-row?
  [m]
  (and (= :assistant (:role m))
       (some? (:error m))))

(defn- drop-errored-pairs
  "Strip errored assistant rows and the preceding user prompt."
  [messages]
  (reduce (fn [acc msg]
            (cond
              (not (errored-agent-row? msg)) (conj acc msg)
              (= :user (:role (peek acc)))  (pop acc)
              :else                          acc))
          []
          messages))

(def ^:private placeholder-grace-period-ms
  "How long an unfinished placeholder row is treated as an in-flight stream rather
  than a crashed/aborted turn. Generous enough to cover any plausible live agent
  loop — the `transforms_codegen` profile allows 30 iterations and there is no
  client-independent LLM timeout, so a long-running turn can easily exceed
  several minutes. Readers older than this fall back to rendering the trailing
  `turn_aborted` alert.

  Bias: this is the 'show a still-running stream as aborted' window vs. the
  'show a crashed turn as absent' window. The first is more user-visible (a
  mid-stream refresh would alert 'Response was interrupted' for a turn that's
  actually fine), so prefer the longer window."
  (* 30 60 1000))

(defn- ->instant
  "Coerce a t2-returned datetime value to a `java.time.Instant`. Postgres returns
  `OffsetDateTime`; H2 typically returns `LocalDateTime`."
  ^Instant [v]
  (cond
    (instance? Instant v)        v
    (instance? OffsetDateTime v) (.toInstant ^OffsetDateTime v)
    (instance? LocalDateTime v)  (.toInstant ^LocalDateTime v ZoneOffset/UTC)
    :else                        (do (log/warnf "Unhandled created_at type %s; cannot apply placeholder grace window"
                                                (some-> v class .getName))
                                     nil)))

(defn- placeholder-still-active?
  "True if `row` is an in-flight placeholder created by [[start-turn!]] for a
  stream that hasn't yet completed: assistant role, `:finished` IS NULL (the
  schema-level placeholder marker), and `:created_at` within the grace window.
  Used by [[messages->chat-messages]] to suppress live placeholders from chat
  reads so a reload mid-stream does not render an empty `turn_aborted` stub."
  [{:keys [role finished created_at]}]
  (and (= :assistant role)
       (nil? finished)
       (some? created_at)
       (when-let [then (->instant created_at)]
         (< (.toMillis (java.time.Duration/between then (Instant/now)))
            placeholder-grace-period-ms))))

(defn messages->chat-messages
  "Convert a seq of `MetabotMessage` model instances into a flat vector of `MetabotChatMessage` maps.
  In-flight placeholder rows (assistant rows still streaming) are always
  skipped. Errored pairs are dropped unless `:include-errored? true`."
  ([messages] (messages->chat-messages messages nil))
  ([messages {:keys [include-errored?]}]
   (let [active (remove placeholder-still-active? messages)]
     (->> (if include-errored? active (drop-errored-pairs active))
          (into [] (mapcat message->chat-messages))))))

(defn conversation-detail
  "Conversation-with-chat-messages snapshot. Nil if not found."
  [conversation-id]
  (when-let [conv (t2/select-one :model/MetabotConversation :id conversation-id)]
    {:conversation_id (:id conv)
     :created_at      (:created_at conv)
     :summary         (:summary conv)
     :user_id         (:user_id conv)
     :chat_messages   (messages->chat-messages
                       (t2/select :model/MetabotMessage
                                  {:where    [:and
                                              [:= :conversation_id conversation-id]
                                              [:= :deleted_at nil]]
                                   :order-by [[:created_at :asc] [:id :asc]]}))}))
