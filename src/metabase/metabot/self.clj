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
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.common :as api]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.registry :as registry]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defn- normalize-known-model
  "Check one adapter's `supported-models` value carries a `:display-name` (and optionally a
  `:context-window`). Anything else throws, so an adapter that invents a different shape fails loudly
  instead of quietly documenting a model with no name — [[metabase.cmd.ai-provider-dox]] falls back to the
  model id in the Model column, which reads as a name rather than as a gap."
  [provider model-id value]
  (if (:display-name value)
    value
    (throw (ex-info (str "Unrecognized supported-models entry for " provider)
                    {:provider provider :model model-id :value value}))))

(defn known-models
  "The models `provider`'s adapter is willing to offer, as `{model-id {:display-name ... :context-window ...}}`.

  This is the allow-list [[list-models]] intersects with the provider's live catalog, so a model listed here is
  available only if the connection's credentials can actually reach it. Returns nil for the provider types that have
  no allow-list: `azure`, whose model is the deployment name the admin gives it, `vllm` and `ollama`, which serve whatever the
  operator loaded, and `google` and `metabase`, whose catalogs are fixed in [[metabase.llm.provider]] instead."
  [provider]
  (when-let [models (registry/optional provider :supported-models)]
    (into {}
          (map (fn [[model-id value]] [model-id (normalize-known-model provider model-id value)]))
          models)))

(defn- parse-provider-model
  "Resolve a `connection-key/model` string into the adapter, model, and credentials needed to serve it.
  Throws a 400 when the string names a connection that is not configured, so a stale
  `llm-metabot-provider` surfaces as a clear error rather than an unauthenticated request."
  [s]
  (let [{:keys [type model credentials ai-proxy?]}
        (or (llm.provider/resolve-model-ref s)
            (throw (ex-info (tru "No LLM provider connection named {0} is configured."
                                 (pr-str (llm.provider/model-ref->connection-key s)))
                            {:status-code 400
                             :api-error   true
                             :error-code  :llm-not-configured
                             :model-ref   s})))]
    {:provider    type
     :stream-fn   (registry/required type :stream)
     :model       model
     :credentials credentials
     :ai-proxy?   ai-proxy?}))

(defn context-window-tokens
  "Input context window (tokens) for a `connection-key/model` string, or nil when the
  connection, provider, or model isn't one we know.

  This is the ceiling a conversation's context (`contextTokens`, the last call's
  prompt + completion) cannot grow past: the max *input* tokens for providers that
  publish split input/output limits (OpenAI's 1,050,000 window is 922,000 input +
  128,000 output), and the shared context window for providers whose output counts
  against the window itself (Anthropic et al.)."
  [model-ref]
  (registry/context-window-tokens model-ref))

(defn list-models
  "List available models for a provider using its configured credentials, or `:credentials` in `opts`.
  The shape of the credentials map varies by provider: API-key providers take `{:api-key ...}`, while Bedrock takes
  optional AWS key material and region (see [[metabase.metabot.self.bedrock/list-models]])."
  ([provider]
   ((registry/required provider :list-models)))
  ([provider opts]
   ((registry/required provider :list-models) opts)))

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

(defn- connection-error?
  "True if `t` is a transient connection/timeout failure worth retrying."
  [t]
  (or (instance? java.net.ConnectException t)
      (instance? java.net.SocketTimeoutException t)
      (instance? java.io.IOException t)))

(defn- retryable-error?
  "Whether an exception represents a transient LLM error worth retrying.
  Checks for retryable HTTP status codes in ex-data (set by claude-raw/openai-raw)
  and connection-level failures.

  Walks the cause chain because provider adapters wrap the underlying socket
  error: `rethrow-api-error!` rethrows e.g. a `Read timed out` as an
  `ExceptionInfo` (with `:error-code :provider-request-failed` and no `:status`)
  whose *cause* is the original `SocketTimeoutException`. Inspecting only the
  top-level exception would miss it and we'd never retry a transient timeout.

  An adapter opts a specific failure out of that default by tagging its ex-data
  `:retryable? false` (top-level only), which wins over both checks. Note that
  omitting `:status` does not — the cause walk still matches."
  [^Exception e]
  (let [data (ex-data e)]
    (if (false? (:retryable? data))
      false
      (boolean
       (or (retryable-status? (:status data))
           ;; Connection errors (e.g. under load, connection refused/reset), possibly
           ;; wrapped one or more levels deep by a provider adapter. Bounded to 10
           ;; levels to guard against a cyclic getCause chain.
           (some connection-error? (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e)))))))))

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

(defn- provider-label
  "The `:provider` label on an LLM call's metrics: the type of the connection serving it, so `metabase` when proxied."
  [{:keys [provider ai-proxy?]}]
  (if ai-proxy? "metabase" provider))

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
                            :provider   (provider-label tracking-opts)
                            :error-type "llm-sse-error"}))
         part)))

(defn- report-token-usage-xf
  "Transducer that reports token_usage metrics for :usage parts in the aisdk stream.

  Every field goes to [[metabase.metabot.usage/log-ai-usage!]], where `:tag` stands in for a missing `:source`.

  Prometheus + Snowplow:
    - `:model`      - the model reference (e.g. `openrouter/anthropic/claude-haiku-4.5`)
    - `:tag`        - the specific purpose for which the tokens were used (e.g. 'agent', 'sql-fixing')

  Prometheus only:
    - `:provider`   - the provider type serving it (e.g. `openrouter`)
    - `:ai-proxy?`  - whether the call went through the managed AI proxy

  Snowplow only:
    - `:profile-id` - the profile id (e.g. `:internal`)
    - `:request-id` - UUID string for this request
    - `:session-id` - conversation UUID string
    - `:source`     - the source of the request (e.g., 'metabot_agent', 'document_generate_content').
                      Indicates which API endpoint or workflow initiated the LLM call.

  Neither:
    - `:model-name` - the model as the provider names it (e.g. `anthropic/claude-haiku-4.5`)"
  [{:keys [model model-name provider profile-id request-id session-id source tag ai-proxy?] :as tracking-opts}]
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
                 :provider              (provider-label tracking-opts)
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
                 :provider              provider
                 :model-name            model-name
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
  Only fires when :source and :request-id are present in tracking-opts. A tool name outside `tools` is
  model output that may carry user data, so it is reported as \"unknown\"."
  [{:keys [request-id session-id source profile-id iteration]} tools]
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
                                         :event-details                 (cond-> {"tool_name" (if (contains? tools (:function part))
                                                                                               (:function part)
                                                                                               "unknown")}
                                                                          (some? iteration) (assoc "step" iteration))}))
         part)))

(defn- with-retries
  "Execute `(thunk)` with retry logic for transient LLM errors.
  Retries up to `max-llm-retries` attempts with exponential backoff.
  Records prometheus metrics with `:model` and `:tag` from `tracking-opts`, and its [[provider-label]], as labels.

  `retry?` is an optional predicate on the caught exception, ANDed with
  [[retryable-error?]]; returning false surfaces the error without retrying. The
  streaming path passes one to avoid replaying a partially-consumed response."
  ([tracking-opts thunk]
   (with-retries tracking-opts thunk (constantly true)))
  ([tracking-opts thunk retry?]
   (let [labels {:model    (:model tracking-opts)
                 :source   (:tag tracking-opts)
                 :provider (provider-label tracking-opts)}]
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
                            (log/warn "LLM call failed with retryable error, retrying"
                                      {:attempt attempt
                                       :max     max-llm-retries
                                       :delay   delay
                                       :status  (:status (ex-data e))
                                       :error   (ex-message e)})
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

(def ^:private provider-billing-error-codes
  "Codes Anthropic and OpenAI put in an error body when the account is out of credit or over a spend limit."
  #{"billing_error" "enforced_spend_limit_reached" "insufficient_quota" "credit_balance_exhausted"
    "organization_spend_limit_exceeded" "project_spend_limit_exceeded" "organization_usage_limit_exceeded"})

(defn- provider-failure
  "Classify a provider API error's ex-data as `:billing`, `:rate-limit` or `:auth`, or nil for any other failure."
  [{:keys [status body]}]
  (let [{error-type :type error-code :code :keys [message details]} (:error body)]
    (cond
      (or (= status 402)
          (some provider-billing-error-codes [error-type error-code (:error_code details)])
          ;; Anthropic reports a used-up credit balance or spend limit as a plain invalid_request_error
          (and (= status 400) (re-find #"credit balance|API usage limits" (str message))))
      :billing

      (= status 429)
      :rate-limit

      (or (= status 401) (= "permission_error" error-type))
      :auth)))

(defn byok-provider-error
  "A user-facing `{:message :error-code}` for a provider failure that the customer can fix on their side, or nil.
  Always nil on the managed provider, where these failures are Metabase's to fix. Only admins are told which
  provider failed and where to fix it."
  [e]
  (let [{:keys [api-error provider] :as data} (ex-data e)]
    (when-let [failure (and api-error
                            provider
                            (not (llm.provider/managed-model-ref? (metabot.settings/llm-metabot-provider)))
                            (provider-failure data))]
      (let [admin?        api/*is-superuser?*
            provider-name (or (some-> (llm.provider/provider-type provider) :label str) provider)]
        (case failure
          :billing    {:error-code "ai_provider_billing"
                       :message    (if admin?
                                     (tru "{0} rejected the request because of a billing issue, such as running out of credits. Check the billing settings for your account." provider-name)
                                     (tru "The AI provider rejected the request because of a billing issue. Please contact your administrator."))}
          :rate-limit {:error-code "ai_provider_rate_limit"
                       :message    (if admin?
                                     (tru "{0} is rate limiting requests from Metabase. Try again in a moment, and if it keeps happening, check the rate limits for your account." provider-name)
                                     (tru "The AI provider is rate limiting requests right now. Please try again in a moment."))}
          :auth       {:error-code "ai_provider_auth"
                       :message    (if admin?
                                     (tru "{0} rejected the API key or credentials that Metabase sent. Check them in the AI settings." provider-name)
                                     (tru "The AI provider rejected the credentials that Metabase sent. Please contact your administrator."))})))))

(defn- missing-required-permission
  "Returns the metabot permission keyword that the current user is missing
  (the base `:permission/metabot` or `required-perm`), or nil when granted.
  The base `:permission/metabot` is always checked even when `required-perm`
  is nil — every LLM call must at minimum require metabot to be turned on.
  Shared by the throwing structured path and the error-part-emitting
  streaming path."
  [required-perm]
  (let [perms (or scope/*current-user-metabot-permissions*
                  (scope/resolve-user-permissions api/*current-user-id*))]
    (scope/missing-permission perms required-perm)))

(defn- check-permission!
  "Structured-path permission gate: throws `:metabot/permission-denied` ex-info
  on denial. Streaming path uses an error part instead — see [[call-llm]]."
  [required-perm]
  (when-let [missing (missing-required-permission required-perm)]
    (throw (ex-info "Permission denied"
                    {:type                :metabot/permission-denied
                     :required-permission missing}))))

(defn- error-reducible
  "Returns a reducible that emits a single `{:type :error ...}` part and stops.
  Used by [[call-llm]] for pre-flight failures (usage limit, permission denial)
  that the streaming consumer should surface inline rather than as throws."
  [message error-code]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (unreduced (rf init {:type :error :error {:message message :error-code error-code}})))))

(defn- warn-when-missing-required-permission
  "Every LLM call should declare which metabot permission gates it. Logs a warn
  pointing at the source/tag when the caller forgets, so we can find and fix
  them. Shared by [[call-llm]] and [[call-llm-structured-with-trace]]."
  [fn-name opts]
  (when-not (:required-permission opts)
    (log/warnf "%s invoked without :required-permission (source=%s tag=%s) — every LLM call should declare which metabot permission gates it."
               fn-name (pr-str (:source opts)) (pr-str (:tag opts)))))

(defn llm-call-unavailable-reason
  "Single pre-flight gate for callers that want to *skip* an LLM call cleanly instead of
  attempting one and catching the failure it would throw. Bundles every check that decides
  whether a structured LLM call requiring `required-permission` can run right now. The first
  two are instance-level prerequisites the call paths assume are on; the usage/permission
  checks are the same ones (in the same order) that [[call-llm]] /
  [[call-llm-structured-with-trace]] enforce before opening the provider stream:

    :metabot-disabled  — Metabot (or AI features) is turned off
    :no-llm            — no provider API key is configured
    :usage-limit       — the instance / tenant / user is over its AI usage limit
                         (see [[metabase.metabot.usage/check-usage-limits!]])
    :permission-denied — the current user lacks the base `:permission/metabot` or
                         `required-permission`

  Returns nil when the call would be allowed. The instance-level switches need no user; the
  usage/permission checks resolve against the *current user*, so establish the intended
  binding (e.g. `request/with-current-user`) before calling."
  [required-permission]
  (cond
    (not (metabot.settings/metabot-enabled?))                 :metabot-disabled
    (not (metabot.settings/llm-metabot-configured?))          :no-llm
    (some? (usage/check-usage-limits!))                       :usage-limit
    (some? (missing-required-permission required-permission)) :permission-denied))

(defn llm-call-available?
  "Boolean convenience over [[llm-call-unavailable-reason]]: true when a structured LLM call
  requiring `required-permission` would be permitted for the current user right now (Metabot
  enabled, provider configured, under usage limits, and the user holds the needed permissions)."
  [required-permission]
  (nil? (llm-call-unavailable-reason required-permission)))

(defn call-llm
  "Call an LLM and stream processed parts.

  `provider-and-model` is a string like `anthropic/claude-haiku-4-5` or
  `openrouter/anthropic/claude-haiku-4.5`.  The first segment selects the
  provider adapter; the rest is the model name passed to the API.

  `parts` is a sequence of AISDK parts (`:text`, `:tool-input`, `:tool-output`)
  and user messages (`{:role :user, :content ...}`).  Each adapter converts
  these into its own wire format.

  `tracking-opts` is a map with analytics + gating context. Tracking fields:
  see [[report-token-usage-xf]]. Gating field:
    :required-permission - A `:permission/metabot-*` keyword the current user
                           must hold (as `:yes`) in addition to the base
                           `:permission/metabot`, which is always checked.
                           Omitting it still gets the base check, plus a
                           log/warn pointing at the caller's source/tag.

  `llm-opts` is an optional map of provider-facing call options — see
  [[parse-provider-model]]'s adapters for what each one honors.

  Returns a reducible that, when consumed, traces the full LLM round-trip as an
  OTel span and retries transient errors with exponential backoff. Global usage
  limits and the permission gate are enforced before the stream opens; either
  one failing yields a reducible of a single `:error` part rather than throwing
  (`\"ai_usage_limit_reached\"` and `\"permission_denied\"` respectively)."
  ([provider-and-model system-msg parts tools tracking-opts]
   (call-llm provider-and-model system-msg parts tools tracking-opts nil))
  ([provider-and-model system-msg parts tools tracking-opts {:keys [tool-choice]}]
   (warn-when-missing-required-permission "call-llm" tracking-opts)
   (or (when-let [limit-msg (usage/check-usage-limits!)]
         (error-reducible limit-msg "ai_usage_limit_reached"))
       (when-let [missing (missing-required-permission (:required-permission tracking-opts))]
         (error-reducible (format "Permission denied: %s required" missing) "permission_denied"))
       (let [{:keys [provider stream-fn model credentials ai-proxy?]} (parse-provider-model provider-and-model)]
         (log/info "Calling LLM" {:provider    provider :model model :parts (count parts) :tools (count tools)
                                  :tool-choice tool-choice :ai-proxy? ai-proxy?})
         (let [tracking-opts  (assoc tracking-opts :model provider-and-model :provider provider
                                     :model-name model :ai-proxy? ai-proxy?)
               streaming-opts (cond-> {:model       model :input parts :tools (vals tools)
                                       :credentials credentials :ai-proxy? ai-proxy?
                                       :fast?       (metabot.settings/llm-fast-mode)}
                                system-msg                  (assoc :system system-msg)
                                (and (seq tools)
                                     tool-choice)           (assoc :tool_choice tool-choice)
                                (:session-id tracking-opts) (assoc :prompt-cache-key (:session-id tracking-opts)))
               make-source    (fn []
                                (eduction (comp (core/tool-executor-xf tools)
                                                (core/lite-aisdk-xf)
                                                (core/stamp-tool-titles-xf tools)
                                                (report-aisdk-errors-xf tracking-opts)
                                                (report-token-usage-xf tracking-opts)
                                                (report-tool-usage-xf tracking-opts tools))
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

(defn- json-schema->malli
  "Malli equivalent of `json-schema`, for the JSON Schema subset [[core/LLMRequestOpts]] accepts as `:schema`."
  [{:keys [type properties required additionalProperties items minimum maximum]}]
  (let [schema (case type
                 "object"  (into [:map {:closed (false? additionalProperties)}]
                                 (for [[k v] properties]
                                   [(keyword k) {:optional (not-any? #{(name k)} required)} (json-schema->malli v)]))
                 "array"   [:sequential (if items (json-schema->malli items) :any)]
                 "string"  :string
                 "integer" :int
                 "number"  number?
                 "boolean" :boolean
                 :any)]
    (if (or minimum maximum)
      (cond-> [:and schema]
        minimum (conj [:>= minimum])
        maximum (conj [:<= maximum]))
      schema)))

(defn- structured-output-in-text
  "JSON matching `json-schema` in the text reply of a model that didn't call the structured-output tool.
  Tries the whole reply, then each fenced code block in it from the last one back. Nil when none of them matches."
  [parts json-schema]
  (let [text   (str/join (keep #(when (= :text (:type %)) (:text %)) parts))
        schema (json-schema->malli json-schema)]
    (some (fn [candidate]
            (let [value (try (json/decode-document+kw candidate) (catch Exception _ nil))]
              (when (mr/validate schema value)
                value)))
          (cons text (reverse (map second (re-seq #"(?is)```(?:json)?\s*(.*?)```" text)))))))

(defn- incomplete-structured-output-error
  "The error for a structured call whose turn stopped early without a usable result.

  Two cases use it: the tool call was cut off, or the turn made no tool call and its text held no JSON that
  matches the schema.

  Reports `:error-code \"structured-output-incomplete\"` with `:finish-reason` and `:raw-finish-reason` in
  ex-data, so callers can tell it from a model that simply did not call the tool. It carries no `:status`
  and no cause, so [[retryable-error?]] is false — a replay would stop at the same ceiling."
  [parts reason]
  (ex-info "LLM stopped before completing its structured response"
           {:parts             parts
            :error-code        "structured-output-incomplete"
            :finish-reason     reason
            :raw-finish-reason (core/parts->raw-finish-reason parts)}))

(defn- no-structured-output-error
  "The error for a structured call with no tool call and no text JSON that matches the schema.

  When the turn stopped early, this is [[incomplete-structured-output-error]], so the caller sees why.
  Otherwise the model chose not to call the tool, and the error says so."
  [parts incomplete-reason]
  (if incomplete-reason
    (incomplete-structured-output-error parts incomplete-reason)
    (ex-info "LLM returned no tool call in structured response" {:parts parts})))

(defn call-llm-structured-with-trace
  "Like [[call-llm-structured]], but returns `{:result <map> :parts [<part>...]}`
  so callers can inspect everything the model emitted — any non-tool text, the
  structured tool call itself, and usage. Useful for debugging *why* the model
  produced what it did.

  Unlike [[call-llm]], the usage-limit and permission gates THROW here rather than
  yielding an `:error` part — `ex-info` with `:type :metabot/usage-limit-reached`
  or `:metabot/permission-denied`. Callers wanting to fall back silently must
  catch them.

  `opts` extends `tracking-opts` and may include:
    :required-permission  - A `:permission/metabot-*` keyword that the current
                            user must hold (as `:yes`) in addition to the base
                            `:permission/metabot`, which is always checked.

  A leading {:role \"system\" ...} message in `messages` is forwarded as the
  provider system prompt, keeping untrusted content in the user channel."
  [provider-and-model messages json-schema temperature max-tokens opts]
  (warn-when-missing-required-permission "call-llm-structured-with-trace" opts)
  (when-let [limit-msg (usage/check-usage-limits!)]
    (throw (ex-info limit-msg
                    {:type       :metabot/usage-limit-reached
                     :error-code "ai_usage_limit_reached"
                     :message    limit-msg})))
  (check-permission! (:required-permission opts))
  (let [{:keys [provider stream-fn model credentials ai-proxy?]} (parse-provider-model provider-and-model)
        [system-msg input] (if (= "system" (some-> messages first :role name))
                             [(:content (first messages)) (vec (rest messages))]
                             [nil messages])
        _ (log/info "Calling LLM (structured-with-trace)" {:provider provider
                                                           :model     model
                                                           :msg-count (count input)
                                                           :ai-proxy? ai-proxy?})
        tracking-opts  (-> opts
                           (dissoc :required-permission)
                           (assoc :model provider-and-model :provider provider :model-name model
                                  :ai-proxy? ai-proxy?))
        streaming-opts (cond-> {:model       model
                                :input       input
                                :schema      json-schema
                                :temperature temperature
                                :max-tokens  max-tokens
                                :credentials credentials
                                :ai-proxy?   ai-proxy?}
                         system-msg                  (assoc :system system-msg)
                         (contains? opts :cache?)    (assoc :cache? (:cache? opts))
                         (:session-id tracking-opts) (assoc :prompt-cache-key (:session-id tracking-opts)))]
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
                             parts)
                ;; Only `length` or `content-filter` can turn up here: `"tool-calls"` needs a `:finish`
                ;; part, which the agent loop emits and this single-shot path never runs.
                incomplete-reason (core/parts->incomplete-finish-reason parts)
                malformed?        (and (map? result) (contains? result :_raw_arguments))]
            (cond
              ;; A tool call cut off mid-JSON is not a model emitting bad JSON — the turn ran out of
              ;; room — so report why it stopped. Only `length` reroutes this branch: a content filter
              ;; ends the turn without truncating the JSON it already sent.
              (and malformed? (= incomplete-reason "length"))
              (throw (incomplete-structured-output-error parts incomplete-reason))

              ;; The tool call's JSON failed to parse; `parse-tool-arguments` returned the
              ;; `{:_raw_arguments ...}` sentinel. Reject it as invalid rather than handing a
              ;; bogus map back to the caller as if it were a valid structured result.
              malformed?
              (throw (ex-info "LLM returned malformed JSON in its structured tool call"
                              {:parts         parts
                               :error-code    "structured-output-invalid"
                               :raw-arguments (:_raw_arguments result)}))

              result
              {:result result :parts parts}

              ;; The provider failed mid-stream and emitted an `:error` part instead of throwing
              ;; (e.g. an OpenAI `response.failed`). Surface its message and code so callers/logs
              ;; see the real cause rather than a misleading "no tool call".
              error
              (throw (ex-info (or (:message error) "LLM stream returned an error")
                              {:parts parts :error error :error-code "llm-stream-error"}))

              ;; No tool call. Use JSON from the text when it matches the schema, also when the turn
              ;; stopped early: JSON that the model completed before the stop, in the whole reply or in
              ;; a fenced block, is usable.
              :else
              (if-let [output (structured-output-in-text parts json-schema)]
                (do (log/info "LLM answered in text instead of calling the structured-output tool"
                              {:provider          provider
                               :model             model
                               :tag               (:tag opts)
                               :finish-reason     incomplete-reason
                               :raw-finish-reason (core/parts->raw-finish-reason parts)})
                    {:result output :parts parts})
                (throw (no-structured-output-error parts incomplete-reason))))))))))

(defn call-llm-structured
  "Make an LLM call that returns structured JSON output.

  Uses tool_choice to force the model to call a 'json' tool with the given schema,
  then collects the streamed response and extracts the parsed tool arguments.

  Retry and gating behavior is [[call-llm-structured-with-trace]]'s.

  Args:
    model         - Model identifier (e.g. \"openrouter/anthropic/claude-haiku-4.5\")
    messages      - Sequence of Chat Completions message maps
                    (e.g. [{:role \"user\" :content \"...\"}])
    json-schema   - JSON Schema map for the expected response shape
    temperature   - Sampling temperature
    max-tokens    - Maximum tokens in the response
    opts          - Tracking + gating options. See [[report-token-usage-xf]] for
                    tracking fields and [[call-llm-structured-with-trace]] for
                    `:required-permission`.

  Returns the parsed JSON map from the forced tool call. When the model answers
  in text instead, the JSON in that text is returned if it matches `json-schema`.
  This is also true after an early stop, but not when the stop truncated the JSON
  of a tool call. That case, and an early stop with no matching JSON, throw
  `structured-output-incomplete`.
  For access to the full streamed trace (non-tool text), see
  [[call-llm-structured-with-trace]]."
  [provider-and-model messages json-schema temperature max-tokens opts]
  (:result (call-llm-structured-with-trace
            provider-and-model messages json-schema temperature max-tokens opts)))
