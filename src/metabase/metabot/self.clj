(ns metabase.metabot.self
  "LLM client infrastructure using reducible streams.

  Key design decisions:
  - LLM APIs return IReduceInit (reducible) instead of core.async channels
  - Standard Clojure transducers work directly: (into [] xf (claude-raw {...}))
  - Tools can return plain values or IReduceInit (for streaming results)
  - No core.async required anywhere

  TODO:
  - figure out what's lacking compared to ai-service"
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.common :as api]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.usage :as usage]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defn- resolve-adapter [provider]
  ;; a `case` inside of function instead of a map so that with-redefs work well
  (case provider
    "anthropic"        claude/claude
    "azure"            azure/azure
    "bedrock"          bedrock/bedrock
    "chat-completions" chat-completions/chat-completions
    "openai"           openai/openai
    "openrouter"       openrouter/openrouter
    (throw (ex-info (str "Unknown LLM provider: " provider)
                    {:provider provider}))))

(defn- resolve-model-lister [provider]
  ;; a `case` inside of function instead of a map so that with-redefs work well
  (case provider
    "anthropic"        claude/list-models
    "azure"            azure/list-models
    "bedrock"          bedrock/list-models
    "chat-completions" chat-completions/list-models
    "openai"           openai/list-models
    "openrouter"       openrouter/list-models
    (throw (ex-info (str "Unknown LLM provider: " provider)
                    {:provider provider}))))

(defn- parse-provider-model [s]
  (let [provider (provider-util/provider-and-model->provider s)]
    {:provider   provider
     :stream-fn  (resolve-adapter provider)
     :model      (provider-util/provider-and-model->model s)
     :ai-proxy?  (provider-util/metabase-provider? s)}))

(defn list-models
  "List available models for a provider using its configured credentials, or `:credentials` in `opts`.
  The shape of the credentials map varies by provider: API-key providers take `{:api-key ...}`, while Bedrock takes
  AWS key material and region (see [[bedrock/list-models]])."
  ([provider]
   ((resolve-model-lister provider)))
  ([provider opts]
   ((resolve-model-lister provider) opts)))

;;; General LLM calling
;; Matches the Python ai-service retry behavior:
;;   - tenacity @retry on _get_stream_response: 3 attempts on RateLimitError
;;   - litellm _should_retry: retries on 408, 409, 429, and >= 500
;;   - litellm _calculate_retry_after: exponential backoff 0.5 * 2^attempt,
;;     clamped to [0, 8s], plus random jitter up to 0.75s.
;;     Respects Retry-After header if present and ≤ 60s.

(def ^:private ^:const max-llm-retries
  "Maximum number of LLM call attempts (1 initial + 2 retries)."
  3)

(def ^:private ^:const initial-retry-delay-ms
  "Base delay for exponential backoff (milliseconds). Matches litellm INITIAL_RETRY_DELAY = 0.5s."
  500)

(def ^:private ^:const max-retry-delay-ms
  "Maximum delay between retries (milliseconds). Matches litellm MAX_RETRY_DELAY = 8.0s."
  8000)

(def ^:private ^:const max-jitter-ms
  "Maximum random jitter added to retry delay (milliseconds). Matches litellm JITTER = 0.75s."
  750)

(defn- retryable-status?
  "Whether an HTTP status code should trigger a retry.
  Matches litellm._should_retry: 408 (timeout), 409 (conflict), 429 (rate limit), >= 500."
  [status]
  (when status
    (or (= status 408)
        (= status 409)
        (= status 429)
        (>= status 500))))

(defn- retryable-error?
  "Whether an exception represents a transient LLM error worth retrying.
  Checks for retryable HTTP status codes in ex-data (set by claude-raw/openai-raw)
  and connection-level failures."
  [^Exception e]
  (boolean
   (or (retryable-status? (:status (ex-data e)))
       ;; Connection errors (e.g. under load, connection refused/reset)
       (instance? java.net.ConnectException e)
       (instance? java.net.SocketTimeoutException e)
       (instance? java.io.IOException e))))

(defn- parse-retry-after-header
  "Extract retry-after seconds from response headers in ex-data, if present and ≤ 60s.
  Returns nil if not present or not a reasonable value. Handle repeated headers defensively so a
  malformed header never turns a retryable error into an uncaught cast/parse error."
  [^Exception e]
  (when-let [headers (:headers (ex-data e))]
    (when-let [raw (or (get headers "retry-after")
                       (get headers "Retry-After"))]
      (let [retry-after (if (sequential? raw) (first raw) raw)]
        (when (string? retry-after)
          (try
            (let [seconds (Long/parseLong retry-after)]
              (when (<= 0 seconds 60)
                (* seconds 1000)))
            (catch NumberFormatException _ nil)))))))

(defn- retry-delay-ms
  "Calculate retry delay in milliseconds using exponential backoff with jitter.
  Respects Retry-After header when present. Matches litellm._calculate_retry_after."
  [attempt ^Exception e]
  (let [header-ms  (parse-retry-after-header e)
        jitter     (long (* max-jitter-ms (Math/random)))
        backoff-ms (-> (* initial-retry-delay-ms (Math/pow 2.0 (dec attempt)))
                       (long)
                       (max 0)
                       (min max-retry-delay-ms))]
    (+ (if (and header-ms (pos? header-ms))
         header-ms
         backoff-ms)
       jitter)))

(defn- report-aisdk-errors-xf
  "Transducer that logs and increments the llm-errors counter for :error parts in the aisdk stream."
  [tracking-opts]
  (map (fn [part]
         (when (= (:type part) :error)
           ;; A streamed `:error` part means the provider failed mid-response (e.g. an OpenAI
           ;; `response.failed`) without throwing, so nothing else logs it. Surface it here so it
           ;; shows up in the server logs alongside the metric and the persisted turn error.
           (log/error "Metabot LLM stream returned an error"
                      {:model  (:model tracking-opts "unknown")
                       :source (:tag tracking-opts "none")
                       :error  (:error part)})
           (analytics/inc! :metabase-metabot/llm-errors
                           {:model      (:model tracking-opts "unknown")
                            :source     (:tag tracking-opts "none")
                            :error-type "llm-sse-error"}))
         part)))

(defn- report-token-usage-xf
  "Transducer that reports token_usage metrics for :usage parts in the aisdk stream.

  Prometheus + Snowplow:
    - `:profile-id` — the profile id (e.g. `:internal`)
    - `:model`      — the model (e.g. `openrouter/anthropic/claude-haiku-4.5`)
    - `:tag`        — the specific purpose for which the tokens were used (e.g. 'agent', 'sql-fixing')

   Snowplow only:
    - `:request-id` — UUID string for this request
    - `:session-id` — conversation UUID string
    - `:source`     — the source of the request (e.g., 'metabot_agent', 'document_generate_content').
                      Indicates which API endpoint or workflow initiated the LLM call."
  [{:keys [model profile-id request-id session-id source tag ai-proxy?]}]
  (let [start-ms      (u/start-timer)]
    (map (fn [part]
           (when (= (:type part) :usage)
             (let [usage           (:usage part)
                   model           (or model (:model part) "unknown")
                   prompt          (:promptTokens usage 0)
                   completion      (:completionTokens usage 0)
                   cache-creation  (:cacheCreationTokens usage 0)
                   cache-read      (:cacheReadTokens usage 0)]
               (analytics.core/track-token-usage!
                ;; The caller can omit request-id (and other snowplow opts) to skip snowplow tracking.
                {:prometheus            true
                 :snowplow              (some? request-id)
                 :profile               (some-> profile-id name)
                 :model-id              model
                 :prompt-tokens         prompt
                 :completion-tokens     completion
                 :cache-creation-tokens cache-creation
                 :cache-read-tokens     cache-read
                 :total-tokens          (+ prompt completion)
                 :estimated-costs-usd   0.0
                 :duration-ms           (long (u/since-ms start-ms))
                 :user-id               api/*current-user-id*
                 :request-id            (some-> request-id analytics.core/uuid->ai-service-hex-uuid)
                 :session-id            session-id
                 :source                source
                 :tag                   tag})
               (usage/log-ai-usage!
                {:source                (or source tag "unknown")
                 :model                 model
                 :prompt-tokens         prompt
                 :completion-tokens     completion
                 :cache-creation-tokens cache-creation
                 :cache-read-tokens     cache-read
                 :conversation-id       session-id
                 :profile-id            profile-id
                 :request-id            request-id
                 :ai-proxied            (boolean ai-proxy?)})))
           part))))

(defn- report-tool-usage-xf
  "Transducer that fires an agent_used_tool :snowplow/ai_service_event per tool call.
  Only fires when :source and :request-id are present in tracking-opts."
  [{:keys [request-id session-id source profile-id iteration]}]
  (map (fn [part]
         (when (and (some? source)
                    (some? request-id)
                    (= (:type part) :tool-output))
           (analytics.core/track-event! :snowplow/ai_service_event
                                        {:hashed-metabase-license-token (analytics.core/hashed-metabase-token-or-uuid)
                                         :request-id                    (analytics.core/uuid->ai-service-hex-uuid request-id)
                                         :source                        source
                                         :event                         "agent_used_tool"
                                         :user-id                       api/*current-user-id*
                                         :session-id                    session-id
                                         :profile                       (some-> profile-id name)
                                         :duration-ms                   (some-> (:duration-ms part) long)
                                         :result                        (if (:error part) "error" "success")
                                         :event-details                 (cond-> {"tool_name" (:function part)}
                                                                          (some? iteration) (assoc "step" iteration))}))
         part)))

(defn- with-retries
  "Execute `(thunk)` with retry logic for transient LLM errors.
  Retries up to `max-llm-retries` attempts with exponential backoff.
  Records prometheus metrics with `:model` and `:tag` from `tracking-opts` as labels.

  `retry?` is an optional predicate on the caught exception, ANDed with
  [[retryable-error?]]; returning false surfaces the error without retrying. The
  streaming path passes one to avoid replaying a partially-consumed response."
  ([tracking-opts thunk]
   (with-retries tracking-opts thunk (constantly true)))
  ([tracking-opts thunk retry?]
   (let [labels {:model (:model tracking-opts) :source (:tag tracking-opts)}]
     (loop [attempt 1]
       (analytics/inc! :metabase-metabot/llm-requests labels)
       (let [timer  (u/start-timer)
             result (try
                      {:ok (thunk)}
                      (catch Exception e
                        (if (and (< attempt max-llm-retries)
                                 (retry? e)
                                 (retryable-error? e))
                          (let [delay (retry-delay-ms attempt e)]
                            (log/warn e "LLM call failed with retryable error, retrying"
                                      {:attempt attempt
                                       :max     max-llm-retries
                                       :delay   delay
                                       :status  (:status (ex-data e))})
                            (analytics/inc! :metabase-metabot/llm-retries labels)
                            {:retry delay})
                          (do (analytics/inc! :metabase-metabot/llm-errors
                                              (assoc labels :error-type (.getSimpleName (class e))))
                              (throw e))))
                      (finally
                        (analytics/observe! :metabase-metabot/llm-duration-ms labels (u/since-ms timer))))]
         (if-let [delay (:retry result)]
           (do (Thread/sleep ^long delay)
               (recur (inc attempt)))
           (:ok result)))))))

(defn call-llm
  "Call an LLM and stream processed parts.

  `provider-and-model` is a string like `anthropic/claude-haiku-4-5` or
  `openrouter/anthropic/claude-haiku-4.5`.  The first segment selects the
  provider adapter; the rest is the model name passed to the API.

  `parts` is a sequence of AISDK parts (`:text`, `:tool-input`, `:tool-output`)
  and user messages (`{:role :user, :content ...}`).  Each adapter converts
  these into its own wire format.

  `tracking-opts` is a map with analytics context for prometheus and snowplow events. See [[report-token-usage-xf]]
  above for details.

  `llm-opts` is an optional map of provider-facing call options. Currently this
  supports `:tool-choice`, used by profiles like `:sql` that must end in a tool
  call instead of plain assistant text.

  Returns a reducible that, when consumed, traces the full LLM round-trip
  (HTTP call + streaming response) as an OTel span. Retries transient errors
  (429 rate limit, 529 overloaded, connection errors) up to 3 attempts with
  exponential backoff, matching the Python ai-service retry behavior."
  ([provider-and-model system-msg parts tools tracking-opts]
   (call-llm provider-and-model system-msg parts tools tracking-opts nil))
  ([provider-and-model system-msg parts tools tracking-opts {:keys [tool-choice]}]
   (if-let [limit-msg (usage/check-usage-limits!)]
     (reify clojure.lang.IReduceInit
       (reduce [_ rf init]
         (rf init {:type :error :error {:message limit-msg :error-code "ai_usage_limit_reached"}})))
     (let [{:keys [provider stream-fn model ai-proxy?]} (parse-provider-model provider-and-model)]
       (log/info "Calling LLM" {:provider    provider :model model :parts (count parts) :tools (count tools)
                                :tool-choice tool-choice :ai-proxy? ai-proxy?})
       (let [tracking-opts  (assoc tracking-opts :model provider-and-model :ai-proxy? ai-proxy?)
             streaming-opts (cond-> {:model model :input parts :tools (vals tools) :ai-proxy? ai-proxy?}
                              system-msg        (assoc :system system-msg)
                              (and (seq tools)
                                   tool-choice) (assoc :tool_choice tool-choice))
             make-source    (fn []
                              (eduction (comp (core/tool-executor-xf tools)
                                              (core/lite-aisdk-xf)
                                              (report-aisdk-errors-xf tracking-opts)
                                              (report-token-usage-xf tracking-opts)
                                              (report-tool-usage-xf tracking-opts))
                                        (stream-fn streaming-opts)))]
         (reify clojure.lang.IReduceInit
           (reduce [_ rf init]
             (with-span :info {:name       :metabot.agent/call-llm
                               :provider   provider
                               :model      model
                               :part-count (count parts)
                               :tool-count (count tools)}
               ;; `with-retries` re-runs its thunk on a retryable error, which re-opens the
               ;; stream. That is safe only *before* any part has reached `rf`; once the consumer
               ;; has seen output, replaying would duplicate it and re-execute tools. Gate retries
               ;; on "nothing emitted yet" so a mid-stream failure surfaces instead of replaying.
               (let [emitted? (volatile! false)
                     rf*      (fn
                                ([acc]   (rf acc))
                                ([acc x] (vreset! emitted? true) (rf acc x)))]
                 (with-retries
                   tracking-opts
                   #(reduce rf* init (make-source))
                   (fn [_e] (not @emitted?))))))))))))

(defn call-llm-structured
  "Make an LLM call that returns structured JSON output.

  Uses tool_choice to force the model to call a 'json' tool with the given schema,
  then collects the streamed response and extracts the parsed tool arguments.
  Includes the same retry logic as [[call-llm]] for transient errors.

  Args:
    model         - Model identifier (e.g. \"openrouter/anthropic/claude-haiku-4.5\")
    messages      - Sequence of Chat Completions message maps
                    (e.g. [{:role \"user\" :content \"...\"}]). A leading
                    {:role \"system\" ...} message is forwarded as the provider
                    system prompt, keeping untrusted content in the user channel.
    json-schema   - JSON Schema map for the expected response shape
    temperature   - Sampling temperature
    max-tokens    - Maximum tokens in the response
    tracking-opts - See [[report-token-usage-xf]] for fields

  Returns the parsed JSON map from the forced tool call."
  [provider-and-model messages json-schema temperature max-tokens tracking-opts]
  (let [{:keys [provider stream-fn model ai-proxy?]} (parse-provider-model provider-and-model)
        [system-msg input] (if (= "system" (some-> messages first :role name))
                             [(:content (first messages)) (vec (rest messages))]
                             [nil messages])
        _ (log/info "Calling LLM (structured)" {:provider provider
                                                :model model
                                                :msg-count (count input)
                                                :ai-proxy? ai-proxy?})
        tracking-opts  (assoc tracking-opts :model provider-and-model :ai-proxy? ai-proxy?)
        streaming-opts (cond-> {:model       model
                                :input       input
                                :schema      json-schema
                                :temperature temperature
                                :max-tokens  max-tokens
                                :ai-proxy?   ai-proxy?}
                         system-msg (assoc :system system-msg))]
    (with-span :info {:name      :metabot.agent/call-llm-structured
                      :model     model
                      :msg-count (count input)}
      (with-retries
        tracking-opts
        (fn []
          (let [parts (into []
                            (comp (core/aisdk-xf)
                                  (report-aisdk-errors-xf tracking-opts)
                                  (report-token-usage-xf tracking-opts))
                            (stream-fn streaming-opts))
                result (some (fn [{:keys [type arguments]}]
                               (when (= type :tool-input)
                                 arguments))
                             parts)
                error  (some (fn [{:keys [type error]}]
                               (when (= type :error)
                                 error))
                             parts)]
            (cond
              ;; The tool call's JSON failed to parse; `parse-tool-arguments` returned the
              ;; `{:_raw_arguments ...}` sentinel. Reject it as invalid rather than handing a
              ;; bogus map back to the caller as if it were a valid structured result.
              (and (map? result) (contains? result :_raw_arguments))
              (throw (ex-info "LLM returned malformed JSON in its structured tool call"
                              {:parts         parts
                               :error-code    "structured-output-invalid"
                               :raw-arguments (:_raw_arguments result)}))

              result
              result

              ;; The provider failed mid-stream and emitted an `:error` part instead of throwing
              ;; (e.g. an OpenAI `response.failed`). Surface its message and code so callers/logs
              ;; see the real cause rather than a misleading "no tool call".
              error
              (throw (ex-info (or (:message error) "LLM stream returned an error")
                              {:parts parts :error error :error-code "llm-stream-error"}))

              :else
              (throw (ex-info "LLM returned no tool call in structured response"
                              {:parts parts})))))))))
