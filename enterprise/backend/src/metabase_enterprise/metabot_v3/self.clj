(ns metabase-enterprise.metabot-v3.self
  "LLM client infrastructure using reducible streams.

  Key design decisions:
  - LLM APIs return IReduceInit (reducible) instead of core.async channels
  - Standard Clojure transducers work directly: (into [] xf (claude-raw {...}))
  - Tools can return plain values or IReduceInit (for streaming results)
  - No core.async required anywhere

  TODO:
  - figure out what's lacking compared to ai-service"
  (:require
   [metabase-enterprise.metabot-v3.self.core :as core]
   [metabase-enterprise.metabot-v3.self.openrouter :as openrouter]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

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
  (or (retryable-status? (:status (ex-data e)))
      ;; Connection errors (e.g. under load, connection refused/reset)
      (instance? java.net.ConnectException e)
      (instance? java.net.SocketTimeoutException e)
      (instance? java.io.IOException e)))

(defn- parse-retry-after-header
  "Extract retry-after seconds from response headers in ex-data, if present and ≤ 60s.
  Returns nil if not present or not a reasonable value."
  [^Exception e]
  (when-let [headers (:headers (ex-data e))]
    (when-let [retry-after (or (get headers "retry-after")
                               (get headers "Retry-After"))]
      (try
        (let [seconds (Long/parseLong retry-after)]
          (when (<= 0 seconds 60)
            (* seconds 1000)))
        (catch NumberFormatException _ nil)))))

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
  "Transducer that increments the llm-errors counter for :error parts in the aisdk stream."
  [model]
  (map (fn [part]
         (when (= (:type part) :error)
           (prometheus/inc! :metabase-metabot/llm-errors
                            {:model model
                             :source "agent"
                             :error-type "llm-sse-error"}))
         part)))

(defn- report-token-usage-xf
  "Transducer that reports prometheus metrics for :usage parts in the aisdk stream."
  [model]
  (map (fn [part]
         (when (= (:type part) :usage)
           (let [usage      (:usage part)
                 part-model (or (:model part) model)
                 labels     {:model part-model :source "agent"}
                 prompt     (:promptTokens usage 0)
                 completion (:completionTokens usage 0)]
             (prometheus/inc! :metabase-metabot/llm-input-tokens labels prompt)
             (prometheus/inc! :metabase-metabot/llm-output-tokens labels completion)
             (prometheus/observe! :metabase-metabot/llm-tokens-per-call labels (+ prompt completion))))
         part)))

(defn- with-retries
  "Execute `(thunk)` with retry logic for transient LLM errors.
  Retries up to `max-llm-retries` attempts with exponential backoff.
  Records prometheus metrics with `model` as a label."
  [model thunk]
  (let [labels {:model model :source "agent"}]
    (loop [attempt 1]
      (prometheus/inc! :metabase-metabot/llm-requests labels)
      (let [timer  (u/start-timer)
            result (try
                     {:ok (thunk)}
                     (catch Exception e
                       (if (and (< attempt max-llm-retries)
                                (retryable-error? e))
                         (let [delay (retry-delay-ms attempt e)]
                           (log/warn e "LLM call failed with retryable error, retrying"
                                     {:attempt attempt
                                      :max     max-llm-retries
                                      :delay   delay
                                      :status  (:status (ex-data e))})
                           (prometheus/inc! :metabase-metabot/llm-retries labels)
                           {:retry delay})
                         (do (prometheus/inc! :metabase-metabot/llm-errors
                                              (assoc labels :error-type (.getSimpleName (class e))))
                             (throw e))))
                     (finally
                       (prometheus/observe! :metabase-metabot/llm-duration-ms labels (u/since-ms timer))))]
        (if-let [delay (:retry result)]
          (do (Thread/sleep ^long delay)
              (recur (inc attempt)))
          (:ok result))))))

(defn call-llm
  "Call an LLM and stream processed parts.

  `parts` is a sequence of AISDK parts (`:text`, `:tool-input`, `:tool-output`)
  and user messages (`{:role :user, :content ...}`).  Each adapter converts
  these into its own wire format.

  Returns a reducible that, when consumed, traces the full LLM round-trip
  (HTTP call + streaming response) as an OTel span. Retries transient errors
  (429 rate limit, 529 overloaded, connection errors) up to 3 attempts with
  exponential backoff, matching the Python ai-service retry behavior."
  [model system-msg parts tools]
  (log/info "Calling LLM" {:model model :parts (count parts) :tools (count tools)})
  (let [opts (cond-> {:model model :input parts :tools (vec tools)}
               system-msg (assoc :system system-msg))
        make-source (fn []
                      (eduction (comp (core/tool-executor-xf tools)
                                      (core/lite-aisdk-xf)
                                      (report-aisdk-errors-xf model)
                                      (report-token-usage-xf model))
                                (openrouter/openrouter opts)))]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (with-span :info {:name       :metabot-v3.agent/call-llm
                          :model      model
                          :part-count (count parts)
                          :tool-count (count tools)}
          (with-retries model
            #(reduce rf init (make-source))))))))
