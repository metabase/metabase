(ns metabase-enterprise.metabot-v3.api.slackbot.streaming
  "Streaming AI responses to Slack using Slack's chat streaming API
   (startStream/appendStream/stopStream)."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase-enterprise.metabot-v3.api.slackbot.events :as slackbot.events]
   [metabase-enterprise.metabot-v3.api.slackbot.persistence :as slackbot.persistence]
   [metabase-enterprise.metabot-v3.api.slackbot.query :as slackbot.query]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.persistence :as metabot-v3.persistence]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.common :as api]
   [metabase.channel.slack :as channel.slack]
   [metabase.permissions.core :as perms]
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
        msg-history (slackbot.persistence/message-history conversation-id bot-msg-ids)]
    (->> (:messages thread)
         (filter :text)
         (remove ignore-msg?)
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
      (and title full-link) (str "📊 <" full-link "|" (escape-slack-link-text title) ">")
      title                 title
      full-link             (str "📊 <" full-link "|Open in Metabase>")
      :else                 nil)))

(declare feedback-blocks)

(defn- viz-output->blocks
  "Build blocks for a visualization to be included in the finalized stop-stream message."
  [client {:keys [type content]} filename title link]
  (let [text (or (format-viz-title title link) "Query results")]
    (case type
      :table (let [title-block {:type "section"
                                :text {:type "mrkdwn" :text text}}
                   blocks      (into [title-block] content)]
               blocks)
      :image (let [{:keys [id]} (channel.slack/upload-file-with-token! (:token client) content (str filename ".png"))
                   blocks          [{:type "section"
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

(defn- tool-name->friendly
  "Convert a tool name to a user-friendly status message (gerund form)."
  [tool-name]
  (get tool-friendly-names tool-name "Thinking"))

(def ^:private min-text-batch-size
  "Minimum characters to accumulate before considering a flush."
  250)

(def ^:private min-flush-interval-ms
  "Minimum milliseconds between consecutive text flushes to Slack.
   At Slack's rate limit of ~100 calls/minute, 600ms spacing leaves
   headroom for tool-update and other non-text API calls."
  600)

(defn- make-streaming-ai-request
  "Make a streaming AI request with callbacks for each message type.
   Returns data-parts (visualizations) from the response.

   Callbacks:
   - on-text: Called with text content (ai-service already buffers markdown links)
   - on-tool-start: Called with {:id :name} when a tool starts
   - on-tool-end: Called with {:id :result} when a tool completes
   - on-data: Called with (index, parsed-content) for each DATA line
   - req-slack-msg-id: The Slack message ts for the user's incoming message
   - get-response-ts: Function that returns the Slack message ts for the bot's response"
  [conversation-id prompt thread bot-user-id channel-id extra-history
   {:keys [on-text on-tool-start on-tool-end on-data req-slack-msg-id get-res-slack-msg-id]}]
  (let [data-idx       (volatile! -1)
        message        (metabot-v3.envelope/user-message prompt)
        metabot-id     (metabot-v3.config/resolve-dynamic-metabot-id nil)
        profile-id     (metabot-v3.config/resolve-dynamic-profile-id "slackbot" metabot-id)
        session-id     (metabot-v3.client/get-ai-service-token api/*current-user-id* metabot-id)
        capabilities   (compute-capabilities)
        thread-history (thread->history thread bot-user-id conversation-id)
        history        (into (vec thread-history) extra-history)
        handle-line    (fn [line]
                         (when-let [[type content] (metabot-v3.u/parse-aisdk-line line)]
                           (case type
                             :TEXT
                             (when (and on-text (seq content))
                               (on-text content))

                             :TOOL_CALL
                             (when on-tool-start
                               (on-tool-start {:id        (:toolCallId content)
                                               :tool-name (:toolName content)}))

                             :TOOL_RESULT
                             (when on-tool-end
                               (on-tool-end {:id     (:toolCallId content)
                                             :result (:result content)}))

                             :DATA
                             (when on-data
                               (on-data (vswap! data-idx inc) content))

                             (log/debugf "Ignoring AI SDK line of type %s" type))))

        _              (metabot-v3.persistence/store-message! conversation-id profile-id [message]
                                                              :slack-msg-id req-slack-msg-id)
        lines          (metabot-v3.client/streaming-request-with-callback

                        {:context         (metabot-v3.context/create-context
                                           {:current_time_with_timezone (str (java.time.OffsetDateTime/now))
                                            :capabilities               capabilities
                                            :slack_channel_id           channel-id})
                         :metabot-id      metabot-id
                         :profile-id      profile-id
                         :session-id      session-id
                         :conversation-id conversation-id
                         :message         message
                         :history         history
                         :state           {}
                         :on-line         handle-line
                         :on-complete     (fn [lines]
                                            (metabot-v3.persistence/store-message!
                                             conversation-id profile-id
                                             (metabot-v3.u/aisdk->messages :assistant lines)
                                             :slack-msg-id (when get-res-slack-msg-id (get-res-slack-msg-id)))
                                            :store-in-db)})]
    (->> (metabot-v3.u/aisdk->messages :assistant lines)
         (filter #(= (:_type %) :DATA)))))

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
  [client prefetched-viz]
  (reduce
   (fn [{:keys [blocks errors] :as acc} [idx {:keys [^Future future filename title link]}]]
     (try
       (let [output         (.get future)
             resolved-title (or (:card-name output) title)
             filename       (or (some-> resolved-title (u/slugify {:max-length 80})) filename)]
         (assoc acc :blocks (into blocks (viz-output->blocks client output filename resolved-title link))))
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
  (when-not @stream-attempted?
    (vreset! stream-attempted? true)
    (when-let [stream (slackbot.client/start-stream client stream-opts)]
      (vreset! stream-state stream))))

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
   - `:stream-state` — volatile holding `{:stream_ts :channel}` once started, nil before
   - `:slack-writer` — agent; callers should `(await slack-writer)` before stopping the stream
   - `:prefetched-viz` — atom holding `{index -> {:future Future :filename str :title str :link str}}` for in-flight visualizations"
  [client {:keys [channel thread-ts team-id user-id]}]
  (let [stream-state      (volatile! nil)
        stream-attempted? (volatile! false)
        tool-id->name     (volatile! {})
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
        last-flush-timer (volatile! nil)

        request-flush!  (fn do-request-flush
                          ([] (do-request-flush false))
                          ([force?]
                           (ensure-stream-started! client stream-opts stream-attempted? stream-state)
                           (when @stream-state
                             (when (or force?
                                       (nil? @last-flush-timer)
                                       (>= (u/since-ms @last-flush-timer) min-flush-interval-ms))
                               (vreset! last-flush-timer (u/start-timer))
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
                                                                           :title  (tool-name->friendly tool-name)
                                                                           :status status}])
                                          (when (= status "complete")
                                            (slackbot.client/append-markdown-text client channel stream_ts "\n"))
                                          nil))))

        on-tool-start (fn [{:keys [id tool-name]}]
                        (request-flush!)
                        (vswap! tool-id->name assoc id tool-name)
                        (send-task-update! id tool-name "in_progress"))

        on-tool-end (fn [{:keys [id]}]
                      (send-task-update! id (get @tool-id->name id) "complete")
                      (vswap! tool-id->name dissoc id))

        prefetched-viz (atom {})
        on-data (fn [idx content]
                  (when (viz-data-types (:type content))
                    (let [{:keys [title filename link]} (viz-metadata content)
                          task (bound-fn* #(generate-viz-output content))]
                      (swap! prefetched-viz assoc idx
                             {:future   (.submit viz-prefetch-executor ^Callable task)
                              :filename filename
                              :title    title
                              :link     link}))))]
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

(defn- feedback-blocks [conversation-id]
  [{:type     "context_actions"
    :block_id "metabot_feedback"
    :elements [{:type            "feedback_buttons"
                :action_id       "metabot_feedback"
                :positive_button {:text  {:type "plain_text" :text "Good"}
                                  :value (json/encode {:conversation_id conversation-id :positive true})}
                :negative_button {:text  {:type "plain_text" :text "Bad"}
                                  :value (json/encode {:conversation_id conversation-id :positive false})}}]}])

(defn- remove-block-type
  "Return blocks with the given block type removed, or nil if empty."
  [blocks block-type]
  (when blocks
    (not-empty (vec (remove #(= block-type (:type %)) blocks)))))

(defn send-response
  "Send a metabot response using Slack's streaming API for progressive updates.
   Shows tool execution status and streams text as it arrives."
  ([client event]
   (send-response client event nil))
  ([client event extra-history]
   (let [channel-id    (:channel event)
         message-ctx   (slackbot.events/event->reply-context event)
         channel       (:channel message-ctx)
         thread-ts     (:thread_ts message-ctx)
         ;; Run both Slack API calls in parallel
         thread-future (future (-> (slackbot.client/fetch-thread client event)
                                   (update :messages #(remove (fn [m] (= (:ts m) (:ts event))) %))))
         auth-future   (future (:body (slackbot.client/auth-test client)))
         auth-info     @auth-future
         thread        @thread-future
         bot-user-id   (:user_id auth-info)
         prompt        (slackbot.events/event->prompt event bot-user-id)

         {:keys [on-text on-tool-start on-tool-end on-data
                 request-flush! start-with-thinking! stream-state slack-writer prefetched-viz]}
         (make-streaming-callbacks client {:channel   channel
                                           :thread-ts thread-ts
                                           :team-id   (:team_id auth-info)
                                           :user-id   (:user event)})]
     (start-with-thinking!)
     (let [conversation-id (slack-thread->conversation-id (:team_id auth-info) channel thread-ts)]
       (letfn [(send-fallback
                 ([text]
                  (send-fallback text nil))
                 ([text blocks]
                  (slackbot.client/post-message client
                                                (cond-> (merge message-ctx {:text text})
                                                  blocks (assoc :blocks blocks)))))
               (send-fallback-with-retries
                 [text blocks]
                 (let [candidate-blocks [blocks
                                         (remove-block-type blocks "context_actions")
                                         nil]]
                   (loop [remaining candidate-blocks
                          seen      #{}
                          attempt   1
                          last-res  nil]
                     (if-let [candidate (first remaining)]
                       (if (contains? seen candidate)
                         (recur (rest remaining) seen attempt last-res)
                         (let [res (send-fallback text candidate)]
                           (if (:ok res)
                             (do
                               (log/debugf "[slackbot] fallback post-message attempt=%d succeeded (block_count=%d block_types=%s)"
                                           attempt
                                           (count (or candidate []))
                                           (pr-str (when candidate (mapv :type candidate))))
                               res)
                             (do
                               (log/warnf "[slackbot] fallback post-message attempt=%d failed: %s (block_count=%d block_types=%s response_messages=%s)"
                                          attempt
                                          (:error res)
                                          (count (or candidate []))
                                          (pr-str (when candidate (mapv :type candidate)))
                                          (pr-str (get-in res [:response_metadata :messages])))
                               (recur (rest remaining) (conj seen candidate) (inc attempt) res)))))
                       last-res))))]
         (try
           ;; Start stream early so assistant persistence has :slack_msg_id.
           (request-flush! true)
           (let [_data-parts (make-streaming-ai-request
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
                               :req-slack-msg-id     (:ts event)
                               :get-res-slack-msg-id (fn [] (:stream_ts @stream-state))})]
             (request-flush! true)
             (await slack-writer)
             (if-let [{:keys [stream_ts channel]} @stream-state]
               ;; Prototype: hold stop-stream until all viz futures finish so text + viz + controls
               ;; finalize as a single message.
               (let [{:keys [blocks errors]} (collect-viz-blocks client @prefetched-viz)]
                 (let [final-blocks (into blocks (feedback-blocks conversation-id))
                       stop-result  (slackbot.client/stop-stream client channel stream_ts final-blocks)]
                   (log/debugf "[slackbot] stop-stream finalize attempt channel=%s thread_ts=%s stream_ts=%s block_count=%d block_types=%s"
                               channel thread-ts stream_ts (count final-blocks) (pr-str (mapv :type final-blocks)))
                   (when-not (:ok stop-result)
                     (log/warnf "[slackbot] stop-stream fallback to post-message: %s" (:error stop-result))
                     (let [fallback-result (send-fallback-with-retries "I generated a response, but Slack failed to finalize streaming. Sharing results below." final-blocks)]
                       (when-not (:ok fallback-result)
                         (log/errorf "[slackbot] fallback post-message failed after stop-stream error: %s" (:error fallback-result))))))
                 (doseq [e errors]
                   (post-viz-error! client channel thread-ts e)))
               (send-fallback "I wasn't able to generate a response. Please try again.")))
           (catch Exception e
             (run! #(.cancel ^Future (:future %) true) (vals @prefetched-viz))
             (log/error e "[slackbot] Error in streaming response")
             (await slack-writer)
             (if-let [{:keys [stream_ts channel]} @stream-state]
               (try
                 (slackbot.client/append-markdown-text client channel stream_ts
                                                       "\nSomething went wrong. Please try again.")
                 (let [stop-result (slackbot.client/stop-stream client channel stream_ts)]
                   (when-not (:ok stop-result)
                     (log/warnf "[slackbot] stop-stream during error cleanup failed: %s" (:error stop-result))
                     (let [fallback-result (send-fallback-with-retries "Something went wrong. Please try again." nil)]
                       (when-not (:ok fallback-result)
                         (log/errorf "[slackbot] cleanup fallback post-message failed: %s" (:error fallback-result))))))
                 (catch Exception stop-e
                   (log/debug stop-e "[slackbot] Failed to stop stream during error cleanup")))
               (send-fallback "Something went wrong. Please try again.")))))))))
