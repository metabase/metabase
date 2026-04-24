(ns metabase.slackbot.streaming
  "Streaming AI responses to Slack using Slack's chat streaming API
   (startStream/appendStream/stopStream)."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.channel.slack :as channel.slack]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.envelope :as metabot.envelope]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.permissions.core :as perms]
   [metabase.slackbot.channel :as slackbot.channel]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.events :as slackbot.events]
   [metabase.slackbot.persistence :as slackbot.persistence]
   [metabase.slackbot.query :as slackbot.query]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent
    Callable
    ExecutionException
    ExecutorService
    Executors
    Future
    ThreadFactory)))

(set! *warn-on-reflection* true)

(def ^:private viz-prefetch-pool-size
  "Maximum number of visualization rendering threads. Limits concurrent query execution
   during streaming so we don't overwhelm the QP or database connections."
  8)

(defonce ^:private ^ExecutorService viz-prefetch-executor
  (let [counter (atom 0)
        factory (reify ThreadFactory
                  (newThread [_ r]
                    (doto (Thread. r (str "viz-prefetch-" (swap! counter inc)))
                      (.setDaemon true))))]
    (Executors/newFixedThreadPool viz-prefetch-pool-size factory)))

(def ^:private slack-writer-await-timeout-ms
  "Maximum time to wait for the Slack writer agent to flush pending writes."
  (* 30 1000))

(def ^:private thinking-placeholder
  "Displayed while waiting for AI response. Excluded from history."
  "_Thinking..._")

(defn- ignore-msg?
  "True for messages that should be excluded from chat history."
  [msg]
  (and (slackbot.events/bot-message? msg)
       (or (= (:text msg) thinking-placeholder)
           (str/blank? (:text msg)))))

(defn- thread->bot-msg-ids
  "Slack message ids produced by our bot."
  [thread]
  (->> (:messages thread)
       (filter slackbot.events/bot-message?)
       (keep :ts)
       set))

(defn- thread->history
  "Convert a Slack thread to an ai-service history object.
   For user messages: uses Slack text (respects edits), strips bot mentions.
   For bot messages: merges tool calls/data from DB with text from Slack.
   This preserves tool history that Slack doesn't store while respecting edits."
  [thread bot-user-id conversation-id]
  (let [bot-msg-ids (thread->bot-msg-ids thread)
        msg-history (slackbot.persistence/message-history conversation-id bot-msg-ids)
        deleted-ids (slackbot.persistence/deleted-message-ids conversation-id bot-msg-ids)]
    (->> (:messages thread)
         (filter :text)
         (remove ignore-msg?)
         (remove (fn [{:keys [ts] :as msg}]
                   (and (slackbot.events/bot-message? msg)
                        (contains? deleted-ids ts))))
         (mapcat (fn [{:keys [ts text] :as msg}]
                   (if (slackbot.events/bot-message? msg)
                     ;; bot messages: merge on tool call info from db
                     (conj (get msg-history ts []) {:role :assistant :content text})
                     ;; user messages: user slack history instead to respect user edits
                     [{:role :user :content (slackbot.events/strip-bot-mention text bot-user-id)}])))
         vec)))

(defn- compute-capabilities
  "Compute capability strings for the current user based on their permissions."
  []
  (let [{:keys [can-create-queries can-create-native-queries]}
        (perms/query-creation-capabilities api/*current-user-id*)]
    (cond-> []
      can-create-queries        (conj "permission:save_questions")
      can-create-native-queries (conj "permission:write_sql_queries"))))

(defn- escape-slack-link-text
  "Escape characters that have structural meaning inside Slack mrkdwn links (`<URL|label>`)."
  [s]
  (-> s
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")
      (str/replace "|" "\u2502")))

(defn- format-viz-title
  "Build the title text for a visualization message.
   Combines the title with a link to the query in Metabase."
  [title link]
  (let [full-link (when link (str (system/site-url) link))]
    (cond
      (and title full-link) (str "\ud83d\udcca <" full-link "|" (escape-slack-link-text title) ">")
      title                 title
      full-link             (str "\ud83d\udcca <" full-link "|Open in Metabase>")
      :else                 nil)))

(defn- viz-output->blocks
  "Build blocks for a visualization to be included in the finalized stop-stream message."
  [{:keys [type content]} filename title link]
  (let [text (or (format-viz-title title link) "Query results")]
    (case type
      :table (let [title-block {:type "section"
                                :text {:type "mrkdwn" :text text}}
                   blocks      (into [title-block] content)]
               blocks)
      :image (let [{:keys [id]} (channel.slack/upload-file! content (str filename ".png"))
                   blocks      [{:type "section"
                                 :text {:type "mrkdwn" :text text}}
                                {:type       "image"
                                 :slack_file {:id id}
                                 :alt_text   (or title filename "Visualization")}]]
               blocks))))

(def ^:private tool-friendly-names
  "Map of tool names to user-friendly gerund descriptions for slackbot profile tools."
  {"search"                   "Searching"
   "construct_notebook_query" "Building query"
   "list_available_fields"    "Finding available fields"
   "get_field_values"         "Getting field values"
   "static_viz"               "Running query"})

(def ^:private min-text-batch-size
  "Minimum characters to accumulate before considering a flush."
  250)

(def ^:private min-flush-interval-ms
  "Minimum milliseconds between consecutive text flushes to Slack.
   At Slack's rate limit of ~100 calls/minute, 600ms spacing leaves
   headroom for tool-update and other non-text API calls."
  600)

(defn- make-streaming-ai-request
  "Run the agent loop for a slackbot conversation, dispatching parts to callbacks.

   Callbacks:
   - on-text: Called with text content string
   - on-tool-start: Called with {:id :tool-name} when a tool starts
   - on-tool-end: Called with {:id :result} when a tool completes
   - on-data: Called with (index, {:type data-type :value data}) for each data part
   - req-slack-msg-id: The Slack message ts for the user's incoming message
   - get-res-slack-msg-id: Function that returns the Slack message ts for the bot's response

   Returns the `external-id` stamped on the assistant `metabot_message` row so
   callers can encode it into feedback button payloads for direct resolution
   without relying on a (channel, slack_msg_id) lookup."
  [conversation-id prompt thread bot-user-id channel-id extra-history
   {:keys [on-text on-tool-start on-tool-end on-data req-slack-msg-id get-res-slack-msg-id
           request-prompt stored-msg-id team-id thread-ts]}]
  (let [message         (metabot.envelope/user-message prompt)
        ai-proxy?       (metabot/metabase-provider? (metabot.settings/llm-metabot-provider))
        ;; Generated up front so it can be baked into feedback button payloads
        ;; at the same time the assistant message is persisted.
        external-id     (str (random-uuid))
        ;; Persist the user message before setup so failed conversations are captured.
        ;; `:user-id` stamps the author on the message row so participation-based
        ;; conversation read permissions work for multi-user Slack threads.
        _               (metabot.persistence/store-message! conversation-id "slackbot" [message]
                                                            :channel-id      channel-id
                                                            :slack-team-id   team-id
                                                            :slack-thread-ts thread-ts
                                                            :slack-msg-id    req-slack-msg-id
                                                            :user-id         api/*current-user-id*
                                                            :ai-proxy?       ai-proxy?)
        data-idx        (volatile! -1)
        request-message (metabot.envelope/user-message (or request-prompt prompt))
        capabilities    (compute-capabilities)
        thread-history  (thread->history thread bot-user-id conversation-id)
        history         (into (vec thread-history) extra-history)
        context         (metabot.context/create-context
                         {:current_time_with_timezone (str (java.time.OffsetDateTime/now))
                          :capabilities               capabilities
                          :slack_channel_id           channel-id})
        messages        (conj (vec history) request-message)
        parts-atom      (atom [])
        dispatch-xf     (comp
                         (u/tee-xf parts-atom)
                         (keep (fn [part]
                                 (case (:type part)
                                   :text
                                   (when (and on-text (seq (:text part)))
                                     (on-text (:text part)))

                                   :tool-input
                                   (when on-tool-start
                                     (on-tool-start {:id        (:id part)
                                                     :tool-name (:function part)}))

                                   :tool-output
                                   (when on-tool-end
                                     (on-tool-end {:id     (:id part)
                                                   :result (:result part)}))

                                   :data
                                   (when on-data
                                     (on-data (vswap! data-idx inc)
                                              {:type  (:data-type part)
                                               :value (:data part)}))

                                   :error
                                   (when on-text
                                     (on-text "Something went wrong. Please try again."))

                                   nil)
                                 nil)))]
    (try
      (transduce dispatch-xf (constantly nil) nil
                 (agent/run-agent-loop
                  {:messages      messages
                   :state         {}
                   :profile-id    :slackbot
                   :context       context
                   :tracking-opts {:source     "slackbot"
                                   :session-id conversation-id}}))
      (finally
        ;; Persist whatever parts we collected, even if the pipeline threw.
        ;; Stores raw native parts (not the lossy AI-SDK-message round-trip) so
        ;; tool-output :structured-output survives for analytics extraction.
        (let [parts @parts-atom]
          (when (seq parts)
            (let [pk (metabot.persistence/store-native-parts!
                      conversation-id "slackbot"
                      (into [] (metabot.persistence/combine-text-parts-xf) parts)
                      :channel-id      channel-id
                      :slack-team-id   team-id
                      :slack-thread-ts thread-ts
                      :slack-msg-id    (when get-res-slack-msg-id (get-res-slack-msg-id))
                      :user-id         api/*current-user-id*
                      :external-id     external-id
                      :ai-proxy?       ai-proxy?)]
              (when stored-msg-id
                (reset! stored-msg-id pk)))))))
    external-id))

(def ^:private viz-data-types
  "DATA part types that represent visualizations."
  #{"static_viz" "adhoc_viz"})

(defn- generate-viz-output
  "Generate visualization output for a data-part. Called by the prefetch executor during streaming."
  [{:keys [type value]}]
  (case type
    "static_viz"
    (let [card-id (or (:entity_id value)
                      (throw (ex-info "static_viz missing entity_id" {:value value})))]
      (slackbot.query/generate-card-output card-id))
    "adhoc_viz"
    (let [query   (or (:query value)
                      (throw (ex-info "adhoc_viz missing query" {:value value})))
          display (or (some-> (:display value) keyword) :table)]
      (slackbot.query/generate-adhoc-output query :display display))))

(defn- viz-error-message
  "Classify a visualization exception into a user-friendly message."
  [^Exception e]
  (let [data (ex-data e)]
    (cond
      (:permissions-error? data)
      "I don't have permission to access this data on your behalf."

      (= :card-not-found (:type data))
      "This saved question no longer exists or has been deleted."

      :else
      "Query execution failed, please try again.")))

(defn- post-viz-error!
  "Post a user-friendly error message for a failed visualization."
  [client channel thread-ts e]
  (try
    (slackbot.client/post-message client {:channel   channel
                                          :thread_ts thread-ts
                                          :text      (viz-error-message e)})
    (catch Exception post-e
      (log/error post-e "Failed to post visualization error"))))

(defn- collect-viz-blocks
  "Wait for all in-flight visualization futures and return blocks to include in stop-stream.
   Returns {:blocks [...], :errors [Exception ...]}.
   For saved cards (static_viz), uses the actual card name as the title."
  [prefetched-viz]
  (reduce
   (fn [{:keys [blocks errors] :as acc} [idx {:keys [^Future future filename title link]}]]
     (try
       (let [output         (.get future)
             resolved-title (or (:card-name output) title)
             filename       (or (some-> resolved-title (u/slugify {:max-length 80})) filename)]
         (assoc acc :blocks (into blocks (viz-output->blocks output filename resolved-title link))))
       (catch ExecutionException e
         (let [cause (or (.getCause e) e)]
           (log/errorf cause "Visualization future %d failed" idx)
           {:blocks blocks :errors (conj errors cause)}))
       (catch Exception e
         (log/errorf e "Visualization future %d failed" idx)
         {:blocks blocks :errors (conj errors e)})))
   {:blocks [] :errors []}
   (sort-by first prefetched-viz)))

(defn- ensure-stream-started!
  "Ensure the Slack stream has been started, attempting once if not already tried."
  [client stream-opts stream-attempted? stream-state]
  (when (compare-and-set! stream-attempted? false true)
    (when-let [stream (slackbot.client/start-stream client stream-opts)]
      (reset! stream-state stream))))

(defn- dismiss-thinking-msg!
  "Delete the 'Thinking...' placeholder message. Idempotent via reset-vals!.
   Called from agent actions only."
  [client channel thinking-ts]
  (let [[ts] (reset-vals! thinking-ts nil)]
    (when ts
      (slackbot.client/delete-message client {:channel channel :ts ts}))))

(defn- drain-pending-text!
  "Drain all accumulated text from pending-text and send to Slack in one call.
   Called from agent actions only."
  [client stream-state pending-text thinking-ts]
  (when-let [{:keys [stream_ts channel]} @stream-state]
    (let [[text] (reset-vals! pending-text "")]
      (when (seq text)
        (dismiss-thinking-msg! client channel thinking-ts)
        (slackbot.client/append-markdown-text client channel stream_ts text)))))

(defn- viz-metadata
  "Extract title, filename, and link metadata from a visualization data-part."
  [{:keys [type value]}]
  (let [title    (:title value)
        filename (or (some-> title (u/slugify {:max-length 80}))
                     (case type
                       "static_viz" (str "chart-" (:entity_id value))
                       "adhoc_viz"  (str "adhoc-" (t/format "yyyy-MM-dd_HH-mm-ss" (t/zoned-date-time)))))
        link     (case type
                   "adhoc_viz"  (:link value)
                   "static_viz" (str "/question/" (:entity_id value)))]
    {:title title :filename filename :link link}))

(defn- make-viz-prefetch-callback
  "Create an `:on-data` callback that submits visualization rendering work eagerly."
  [prefetched-viz]
  (fn [idx content]
    (when (viz-data-types (:type content))
      (let [{:keys [title filename link]} (viz-metadata content)
            task (bound-fn* #(generate-viz-output content))]
        (swap! prefetched-viz assoc idx
               {:future   (.submit viz-prefetch-executor ^Callable task)
                :filename filename
                :title    title
                :link     link})))))

(defn- cancel-prefetched-viz!
  "Cancel any in-flight visualization futures."
  [prefetched-viz]
  (run! #(.cancel ^Future (:future %) true) (vals @prefetched-viz)))

(defn- make-streaming-callbacks
  "Create streaming callback functions and associated control functions.
   Slack API writes are dispatched to a background agent so the AI stream reader is never
   blocked by Slack I/O. The agent serializes writes to preserve ordering.

   Text is coalesced via a shared `pending-text` atom: the callback thread appends text there,
   and each agent action drains everything accumulated since the last write. This means multiple
   flushes that pile up while a Slack API call is in flight get combined into a single append,
   preventing the agent queue from falling further behind over time.

   A 'Thinking...' placeholder message can be posted before the stream starts via
   `:start-with-thinking!`. It is automatically deleted when the first text or tool update
   is sent to the stream.

   Visualization DATA parts are prefetched: when a `static_viz` or `adhoc_viz` DATA part
   arrives mid-stream, the full visualization pipeline (query execution + rendering) is
   submitted to the executor immediately, overlapping with remaining text generation.

   Returns a map with:
   - `:on-text`, `:on-tool-start`, `:on-tool-end`, `:on-data` — callbacks for [[make-streaming-ai-request]]
   - `:start-with-thinking!` — posts a 'Thinking...' placeholder in the thread
   - `:request-flush!` — schedules a drain of pending text to Slack
   - `:stream-state` — atom holding `{:stream_ts :channel}` once started, nil before
   - `:slack-writer` — agent; callers should `(await slack-writer)` before stopping the stream
   - `:prefetched-viz` — atom holding `{index -> {:future Future :filename str :title str :link str}}` for in-flight visualizations"
  [client {:keys [channel thread-ts team-id user-id]}]
  (let [stream-state      (atom nil)
        stream-attempted? (atom false)
        tool-id->name     (atom {})
        ;; Text awaiting write to Slack. Callback thread appends here; agent thread drains.
        ;; An atom because it's shared across threads (callback thread writes, agent thread reads).
        pending-text      (atom "")
        ;; Holds the ts of the "Thinking..." placeholder message, or nil if not posted / already dismissed.
        thinking-ts       (atom nil)
        slack-writer      (agent nil
                                 :error-mode    :continue
                                 :error-handler (fn [_ e] (log/warn e "[slackbot] Async Slack write failed")))
        stream-opts       {:channel   channel
                           :thread_ts thread-ts
                           :team_id   team-id
                           :user_id   user-id}

        ;; Nil means "no flush has happened yet", so the first flush should always pass.
        last-flush-timer (atom nil)

        request-flush!  (fn do-request-flush
                          ([] (do-request-flush false))
                          ([force?]
                           (ensure-stream-started! client stream-opts stream-attempted? stream-state)
                           (when @stream-state
                             (when (or force?
                                       (nil? @last-flush-timer)
                                       (>= (u/since-ms @last-flush-timer) min-flush-interval-ms))
                               (reset! last-flush-timer (u/start-timer))
                               (send-off slack-writer
                                         (bound-fn* (fn [_] (drain-pending-text! client stream-state pending-text thinking-ts) nil)))))))

        start-with-thinking! (fn []
                               (let [response (slackbot.client/post-message client {:channel   channel
                                                                                    :thread_ts thread-ts
                                                                                    :text      thinking-placeholder})]
                                 (when (:ok response)
                                   (reset! thinking-ts (:ts response)))))

        on-text (fn [text]
                  (when (seq text)
                    (swap! pending-text str text)
                    (when (>= (count @pending-text) min-text-batch-size)
                      (request-flush!))))

        send-task-update! (fn [id tool-name status]
                            (when-let [{:keys [stream_ts channel]} @stream-state]
                              (send-off slack-writer
                                        (fn [_]
                                          (drain-pending-text! client stream-state pending-text thinking-ts)
                                          (when (= status "in_progress")
                                            (dismiss-thinking-msg! client channel thinking-ts))
                                          (slackbot.client/append-stream client channel stream_ts
                                                                         [{:type   "task_update"
                                                                           :id     id
                                                                           :title  (tool-friendly-names tool-name "Thinking")
                                                                           :status status}])
                                          (when (= status "complete")
                                            (swap! pending-text #(str "\n\n" %)))
                                          nil))))

        on-tool-start (fn [{:keys [id tool-name]}]
                        (request-flush!)
                        (swap! tool-id->name assoc id tool-name)
                        (send-task-update! id tool-name "in_progress"))

        on-tool-end (fn [{:keys [id]}]
                      (send-task-update! id (get @tool-id->name id) "complete")
                      (swap! tool-id->name dissoc id))

        prefetched-viz (atom {})
        on-data        (make-viz-prefetch-callback prefetched-viz)]
    {:on-text              (bound-fn* on-text)
     :on-tool-start        on-tool-start
     :on-tool-end          on-tool-end
     :on-data              on-data
     :request-flush!       (bound-fn* request-flush!)
     :start-with-thinking! start-with-thinking!
     :stream-state         stream-state
     :slack-writer         slack-writer
     :prefetched-viz       prefetched-viz}))

(defn- slack-thread->conversation-id
  "Generate deterministic conversation ID from Slack thread identifiers.
   Same thread always produces the same UUID (v3)."
  [team-id channel thread-ts]
  (str (java.util.UUID/nameUUIDFromBytes
        (.getBytes (str "slack:" team-id ":" channel ":" thread-ts)))))

(defn- feedback-blocks
  "Build the feedback-button block appended to the final assistant reply.
   `message-external-id` lets the modal handler resolve the rated
   `metabot_message` row directly, without a `(channel, slack_msg_id)` reverse
   lookup. Nil is tolerated for safety (e.g. callers racing persistence) but
   the modal handler will then have to fall back to the slack_msg_id path."
  [conversation-id message-external-id]
  [{:type     "context_actions"
    :block_id "metabot_feedback"
    :elements [{:type            "feedback_buttons"
                :action_id       "metabot_feedback"
                :positive_button {:text  {:type "plain_text" :text "Good"}
                                  :value (json/encode {:conversation_id     conversation-id
                                                       :message_external_id message-external-id
                                                       :positive            true})}
                :negative_button {:text  {:type "plain_text" :text "Bad"}
                                  :value (json/encode {:conversation_id     conversation-id
                                                       :message_external_id message-external-id
                                                       :positive            false})}}]}])

(defn- free-limit-error-message
  [e]
  (let [{:keys [error-code message]} (ex-data e)]
    (when (= error-code "metabase_ai_managed_locked")
      (or message (ex-message e)))))

(defn- prepare-response-context
  "Fetch thread/auth context shared by DM and channel delivery paths."
  [client event]
  (let [channel-id      (:channel event)
        message-ctx     (slackbot.events/event->reply-context event)
        channel         (:channel message-ctx)
        thread-ts       (:thread_ts message-ctx)
        thread-future   (future (-> (slackbot.client/fetch-thread client event)
                                    (update :messages #(remove (fn [m] (= (:ts m) (:ts event))) %))))
        auth-future     (future (:body (slackbot.client/auth-test client)))
        auth-info       @auth-future
        thread          @thread-future
        bot-user-id     (:user_id auth-info)
        prompt          (slackbot.events/event->prompt event bot-user-id)
        conversation-id (slack-thread->conversation-id (:team_id auth-info) channel thread-ts)]
    {:channel-id      channel-id
     :message-ctx     message-ctx
     :channel         channel
     :thread-ts       thread-ts
     :auth-info       auth-info
     :thread          thread
     :bot-user-id     bot-user-id
     :prompt          prompt
     :conversation-id conversation-id}))

(defn- send-dm-response
  [client event extra-history {:keys [channel-id message-ctx channel thread-ts auth-info thread bot-user-id prompt conversation-id]}]
  (let [{:keys [on-text on-tool-start on-tool-end on-data
                request-flush! start-with-thinking! stream-state slack-writer prefetched-viz]}
        (make-streaming-callbacks client {:channel   channel
                                          :thread-ts thread-ts
                                          :team-id   (:team_id auth-info)
                                          :user-id   (:user event)})]
    (start-with-thinking!)
    (try
      ;; Start stream early so assistant persistence has :slack_msg_id.
      (request-flush! true)
      (let [message-external-id (make-streaming-ai-request
                                 conversation-id
                                 prompt
                                 thread
                                 bot-user-id
                                 channel-id
                                 extra-history
                                 {:on-text              on-text
                                  :on-tool-start        on-tool-start
                                  :on-tool-end          on-tool-end
                                  :on-data              on-data
                                  :team-id              (:team_id auth-info)
                                  :thread-ts            thread-ts
                                  :req-slack-msg-id     (:ts event)
                                  :get-res-slack-msg-id (fn [] (:stream_ts @stream-state))})]
        (request-flush! true)
        (when-not (await-for slack-writer-await-timeout-ms slack-writer)
          (log/warn "[slackbot] Timed out waiting for slack-writer agent to flush"))
        (if-let [{:keys [stream_ts channel]} @stream-state]
          ;; Hold stop-stream until all viz futures finish so text + viz + controls
          ;; finalize as a single message.
          (let [{:keys [blocks errors]} (collect-viz-blocks @prefetched-viz)
                final-blocks            (into blocks (feedback-blocks conversation-id message-external-id))
                stop-result             (slackbot.client/stop-stream client channel stream_ts final-blocks)]
            (log/debugf "[slackbot] stop-stream finalize attempt channel=%s thread_ts=%s stream_ts=%s block_count=%d block_types=%s"
                        channel thread-ts stream_ts (count final-blocks) (pr-str (mapv :type final-blocks)))
            (when-not (:ok stop-result)
              (log/warnf "[slackbot] stop-stream fallback to post-message: %s" (:error stop-result))
              (let [fallback-result (slackbot.client/post-thread-reply client
                                                                       message-ctx
                                                                       "I generated a response, but Slack could not render it. Please try again.")]
                (when-not (:ok fallback-result)
                  (log/errorf "[slackbot] fallback post-message failed after stop-stream error: %s" (:error fallback-result)))))
            (doseq [e errors]
              (post-viz-error! client channel thread-ts e)))
          (slackbot.client/post-thread-reply client message-ctx "I wasn't able to generate a response. Please try again.")))
      (catch Exception e
        (cancel-prefetched-viz! prefetched-viz)
        (log/error e "[slackbot] Error in streaming response")
        (when-not (await-for slack-writer-await-timeout-ms slack-writer)
          (log/warn "[slackbot] Timed out waiting for slack-writer agent to flush"))
        (if-let [{:keys [stream_ts channel]} @stream-state]
          (try
            (slackbot.client/append-markdown-text client channel stream_ts
                                                  "\nSomething went wrong. Please try again.")
            (let [stop-result (slackbot.client/stop-stream client channel stream_ts)]
              (when-not (:ok stop-result)
                (log/warnf "[slackbot] stop-stream during error cleanup failed: %s" (:error stop-result))
                (let [fallback-result (slackbot.client/post-thread-reply client
                                                                         message-ctx
                                                                         "Something went wrong. Please try again.")]
                  (when-not (:ok fallback-result)
                    (log/errorf "[slackbot] cleanup fallback post-message failed: %s" (:error fallback-result))))))
            (catch Exception stop-e
              (log/debug stop-e "[slackbot] Failed to stop stream during error cleanup")))
          (slackbot.client/post-thread-reply client message-ctx "Something went wrong. Please try again."))))))

(defn send-response
  "Send a metabot response using Slack delivery suited to the conversation type.
   DMs stream progressively; non-DMs use a visible post/update flow."
  ([client event]
   (send-response client event nil))
  ([client event extra-history]
   (let [message-ctx (slackbot.events/event->reply-context event)]
     (try
       (metabot.usage/check-metabase-managed-free-limit!)
       (let [ctx (prepare-response-context client event)]
         (if (slackbot.events/dm? event)
           (send-dm-response client event extra-history ctx)
           (slackbot.channel/send-channel-response client
                                                   event
                                                   extra-history
                                                   ctx
                                                   {:tool-name->friendly        tool-friendly-names
                                                    :make-streaming-ai-request  make-streaming-ai-request
                                                    :collect-viz-blocks         collect-viz-blocks
                                                    :feedback-blocks            feedback-blocks
                                                    :post-viz-error!            post-viz-error!
                                                    :make-viz-prefetch-callback make-viz-prefetch-callback
                                                    :cancel-prefetched-viz!     cancel-prefetched-viz!})))
       (catch Exception e
         (if-let [message (free-limit-error-message e)]
           (let [result (slackbot.client/post-thread-reply client message-ctx message)]
             (when-not (:ok result)
               (log/errorf "[slackbot] Failed to post managed free limit error message: %s" (:error result))
               (throw e)))
           (throw e)))))))
