(ns metabase-enterprise.metabot-v3.api.slackbot.streaming
  "Streaming AI responses to Slack using Slack's chat streaming API
   (startStream/appendStream/stopStream)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase-enterprise.metabot-v3.api.slackbot.events :as slackbot.events]
   [metabase-enterprise.metabot-v3.api.slackbot.query :as slackbot.query]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.util]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Callable ExecutionException ExecutorService Executors Future)))

(set! *warn-on-reflection* true)

(defonce ^:private ^ExecutorService viz-prefetch-executor
  (Executors/newFixedThreadPool 8))

(defn- strip-bot-mention
  "Remove bot mention prefix from text (e.g., '<@U123> hello' -> 'hello')"
  [text bot-user-id]
  (if bot-user-id
    (str/replace text (re-pattern (str "<@" bot-user-id ">\\s?")) "")
    text))

(defn- thread->history
  "Convert a Slack thread to an ai-service history object.
   Strips bot mentions from user messages when bot-user-id is provided."
  [thread bot-user-id]
  (->> (:messages thread)
       (filter :text)
       (mapv (fn [msg]
               (let [is-bot? (some? (:bot_id msg))
                     content (if is-bot?
                               (:text msg)
                               (strip-bot-mention (:text msg) bot-user-id))]
                 {:role    (if is-bot? :assistant :user)
                  :content content})))))

(defn- compute-capabilities
  "Compute capability strings for the current user based on their permissions."
  []
  (let [{:keys [can-create-queries can-create-native-queries]}
        (perms/query-creation-capabilities api/*current-user-id*)]
    (cond-> []
      can-create-queries        (conj "permission:save_questions")
      can-create-native-queries (conj "permission:write_sql_queries"))))

(defn- send-viz-output
  "Send visualization output to Slack as either table blocks or image."
  [client channel thread-ts {:keys [type content]} filename]
  (case type
    :table (let [response (slackbot.client/post-message client {:channel   channel
                                                                :thread_ts thread-ts
                                                                :blocks    content
                                                                :text      "Query results"})]
             (when-not (:ok response)
               (log/errorf "Slack table blocks error: %s" (pr-str response)))
             response)
    :image (let [filename (str filename ".png")]
             (slackbot.client/post-image client content filename channel thread-ts))))

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
  50)

(defn- make-streaming-ai-request
  "Make a streaming AI request with callbacks for each message type.
   Returns data-parts (visualizations) from the response.

   Callbacks:
   - on-text: Called with text content (ai-service already buffers markdown links)
   - on-tool-start: Called with {:id :name} when a tool starts
   - on-tool-end: Called with {:id :result} when a tool completes
   - on-data: Called with (index, parsed-content) for each DATA line"
  [conversation-id prompt thread bot-user-id channel-id extra-history
   {:keys [on-text on-tool-start on-tool-end on-data]}]
  (let [data-idx       (volatile! -1)
        message        (metabot-v3.envelope/user-message prompt)
        metabot-id     (metabot-v3.config/resolve-dynamic-metabot-id nil)
        profile-id     (metabot-v3.config/resolve-dynamic-profile-id "slackbot" metabot-id)
        session-id     (metabot-v3.client/get-ai-service-token api/*current-user-id* metabot-id)
        capabilities   (compute-capabilities)
        thread-history (thread->history thread bot-user-id)
        history        (into (vec thread-history) extra-history)
        handle-line (fn [line]
                      (when-let [[type content] (metabot-v3.util/parse-aisdk-line line)]
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
                         :on-line         handle-line})]
    (->> (metabot-v3.util/aisdk->messages :assistant lines)
         (filter #(= (:_type %) :DATA)))))

(defn- generate-viz-output
  "Generate visualization output for a data-part. Called both by the prefetch executor (during streaming)
   and synchronously by [[resolve-viz-output]] when no prefetched result exists."
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
  [^Exception e data-part]
  (let [data (ex-data e)]
    (cond
      (:permissions-error? data)
      "I don't have permission to access this data on your behalf."

      (= "Card not found" (ex-message e))
      "This saved question no longer exists or has been deleted."

      (= "adhoc_viz" (:type data-part))
      "Query execution failed, please try again."

      :else
      "Something went wrong while generating this visualization.")))

(defn- resolve-viz-output
  "Get the result of a prefetched visualization Future, or generate synchronously if none exists.
   Unwraps ExecutionException so callers see the original error."
  [data-part ^Future prefetched-future]
  (if prefetched-future
    (try
      (.get prefetched-future)
      (catch ExecutionException e
        (throw (or (.getCause e) e))))
    (generate-viz-output data-part)))

(defn- send-visualizations
  "Send visualization data-parts as separate Slack messages after the stream ends.
   Uses prefetched results when available (submitted during streaming) to reduce latency.
   Posts a temporary indicator message while visualizations are being generated."
  [client channel thread-ts data-parts prefetched-viz]
  (let [vizs (keep-indexed (fn [idx part]
                             (when (#{"static_viz" "adhoc_viz"} (:type part))
                               [idx part]))
                           data-parts)]
    (when (seq vizs)
      (let [indicator (slackbot.client/post-message client {:channel   channel
                                                            :thread_ts thread-ts
                                                            :text      "_Generating visualizations..._"})]
        (try
          (doseq [[idx data-part] vizs]
            (try
              (let [output   (resolve-viz-output data-part (get prefetched-viz idx))
                    filename (case (:type data-part)
                               "static_viz" (str "chart-" (:entity_id (:value data-part)))
                               "adhoc_viz"  (str "adhoc-" (System/currentTimeMillis)))]
                (send-viz-output client channel thread-ts output filename))
              (catch Exception e
                (log/errorf e "Failed to generate visualization for %s" (:type data-part))
                (try
                  (slackbot.client/post-message client {:channel   channel
                                                        :thread_ts thread-ts
                                                        :text      (viz-error-message e data-part)})
                  (catch Exception post-e
                    (log/error post-e "Failed to post visualization error message to Slack"))))))
          (finally
            (when-let [ts (:ts indicator)]
              (slackbot.client/delete-message client {:channel channel :ts ts}))))))))

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
   - `:prefetched-viz` — atom holding `{index -> Future<output>}` for in-flight visualizations"
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

        ensure-stream! (fn []
                         (when-not @stream-attempted?
                           (vreset! stream-attempted? true)
                           (when-let [stream (slackbot.client/start-stream client {:channel   channel
                                                                                   :thread_ts thread-ts
                                                                                   :team_id   team-id
                                                                                   :user_id   user-id})]
                             (vreset! stream-state stream))))

        ;; Delete the "Thinking..." placeholder message. Idempotent via reset-vals!.
        ;; Called from agent actions only.
        dismiss-thinking! (fn []
                            (let [[ts] (reset-vals! thinking-ts nil)]
                              (when ts
                                (slackbot.client/delete-message client {:channel channel :ts ts}))))

        ;; Drain all accumulated text from pending-text and send to Slack in one call.
        ;; Called from agent actions only.
        drain-pending-text! (fn []
                              (when-let [{:keys [stream_ts channel]} @stream-state]
                                (let [[text] (reset-vals! pending-text "")]
                                  (when (seq text)
                                    (dismiss-thinking!)
                                    (slackbot.client/append-markdown-text client channel stream_ts text)))))

        ;; Schedule an agent drain. Cheap to call frequently — if the agent is already busy,
        ;; text just accumulates in pending-text and gets coalesced into the next drain.
        request-flush! (fn []
                         (ensure-stream!)
                         (when @stream-state
                           (send-off slack-writer (fn [_] (drain-pending-text!) nil))))

        start-with-thinking! (fn []
                               (let [response (:body (slackbot.client/slack-post-json client "/chat.postMessage"
                                                                                      {:channel   channel
                                                                                       :thread_ts thread-ts
                                                                                       :text      "_Thinking..._"}))]
                                 (when (:ok response)
                                   (reset! thinking-ts (:ts response)))))

        on-text (fn [text]
                  (when (seq text)
                    (swap! pending-text str text)
                    (when (>= (count @pending-text) min-text-batch-size)
                      (request-flush!))))

        on-tool-start (fn [{:keys [id tool-name]}]
                        (request-flush!)
                        (vswap! tool-id->name assoc id tool-name)
                        (when-let [{:keys [stream_ts channel]} @stream-state]
                          (send-off slack-writer
                                    (fn [_]
                                      (drain-pending-text!)
                                      (dismiss-thinking!)
                                      (slackbot.client/append-stream client channel stream_ts
                                                                     [{:type   "task_update"
                                                                       :id     id
                                                                       :title  (tool-name->friendly tool-name)
                                                                       :status "in_progress"}])
                                      nil))))

        on-tool-end (fn [{:keys [id]}]
                      (when-let [{:keys [stream_ts channel]} @stream-state]
                        (let [tool-name (get @tool-id->name id)]
                          (send-off slack-writer
                                    (fn [_]
                                      (drain-pending-text!)
                                      (slackbot.client/append-stream client channel stream_ts
                                                                     [{:type   "task_update"
                                                                       :id     id
                                                                       :title  (tool-name->friendly tool-name)
                                                                       :status "complete"}])
                                      (slackbot.client/append-markdown-text client channel stream_ts "\n")
                                      nil))))
                      (vswap! tool-id->name dissoc id))

        prefetched-viz (atom {})
        on-data (fn [idx content]
                  (when (#{"adhoc_viz" "static_viz"} (:type content))
                    (let [task (bound-fn* #(generate-viz-output content))]
                      (swap! prefetched-viz assoc idx
                             (.submit viz-prefetch-executor ^Callable task)))))]
    {:on-text              on-text
     :on-tool-start        on-tool-start
     :on-tool-end          on-tool-end
     :on-data              on-data
     :request-flush!       request-flush!
     :start-with-thinking! start-with-thinking!
     :stream-state         stream-state
     :slack-writer         slack-writer
     :prefetched-viz       prefetched-viz}))

(defn send-response
  "Send a metabot response using Slack's streaming API for progressive updates.
   Shows tool execution status and streams text as it arrives."
  ([client event]
   (send-response client event nil))
  ([client event extra-history]
   (let [prompt        (:text event)
         channel-id    (:channel event)
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

         {:keys [on-text on-tool-start on-tool-end on-data
                 request-flush! start-with-thinking! stream-state slack-writer prefetched-viz]}
         (make-streaming-callbacks client {:channel   channel
                                           :thread-ts thread-ts
                                           :team-id   (:team_id auth-info)
                                           :user-id   (:user event)})]
     (start-with-thinking!)
     (try
       (let [data-parts (make-streaming-ai-request
                         (str (random-uuid))
                         prompt
                         thread
                         bot-user-id
                         channel-id
                         extra-history
                         {:on-text       on-text
                          :on-tool-start on-tool-start
                          :on-tool-end   on-tool-end
                          :on-data       on-data})]
         (request-flush!)
         (await slack-writer)
         (if-let [{:keys [stream_ts channel]} @stream-state]
           (do
             (slackbot.client/stop-stream client channel stream_ts)
             (send-visualizations client channel thread-ts data-parts @prefetched-viz))
           (slackbot.client/post-message client (merge message-ctx {:text "I wasn't able to generate a response. Please try again."}))))
       (catch Exception e
         (run! #(.cancel ^Future % true) (vals @prefetched-viz))
         (log/error e "[slackbot] Error in streaming response")
         (await slack-writer)
         (if-let [{:keys [stream_ts channel]} @stream-state]
           (try
             (slackbot.client/append-markdown-text client channel stream_ts
                                                   "\nSomething went wrong. Please try again.")
             (slackbot.client/stop-stream client channel stream_ts)
             (catch Exception stop-e
               (log/debug stop-e "[slackbot] Failed to stop stream during error cleanup")))
           (slackbot.client/post-message client (merge message-ctx
                                                       {:text "Something went wrong. Please try again."}))))))))
