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
   [clojure.string :as str]
   [metabase-enterprise.llm.settings :as llm]
   [metabase-enterprise.metabot-v3.self.claude :as claude]
   [metabase-enterprise.metabot-v3.self.core :as core]
   [metabase-enterprise.metabot-v3.self.openai :as openai]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(comment
  (llm/ee-openai-api-key)
  (llm/ee-ai-features-enabled)
  (def sys
    "You MUST call tools for time or currency questions. If asked 'what time' or 'convert X to Y', do not guess—always call the relevant tool first.")

  (def usr
    "What time is it right now in Europe/Kyiv, and convert 100 EUR to UAH.")

  ;; Now just use standard `into` - no core.async!
  (def q (into [] (openai/openai-raw {:messages [{:role "system" :content sys}
                                                 {:role "user" :content usr}]
                                      :tools    (vals TOOLS)}))))

;;; tools

(mu/defn get-time
  "Return current time for a given IANA timezone."
  [{:keys [tz]} :- [:map {:closed true}
                    [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]]
  (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))

(mu/defn convert-currency
  "Convert an amount between two ISO currencies using a dummy rate."
  [{:keys [amount from to]} :- [:map {:closed true}
                                [:amount :float]
                                [:from :string]
                                [:to :string]]]
  (Thread/sleep 500) ;; we're doing some request to some far away service
  (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
    {:amount    amount
     :from      from
     :to        to
     :rate      rate
     :converted (* amount rate)}))

(mu/defn analyze-data-trend
  "Analyze a data trend by calling back to the LLM for natural language insights.
  This demonstrates a recursive LLM call pattern commonly used in agentic workflows."
  [{:keys [metric values period]} :- [:map {:closed true}
                                      [:metric [:string {:description "The metric being analyzed, e.g. 'revenue', 'users'"}]]
                                      [:values [:vector {:description "Time series values"} number?]]
                                      [:period [:string {:description "Time period, e.g. 'Q1 2025', 'last 6 months'"}]]]]
  ;; Simulate calling back to LLM with a mini-prompt
  (let [prompt (format "Analyze this %s trend over %s: %s. Provide a 1-2 sentence insight highlighting key patterns."
                       metric period (pr-str values))]
    (openai/openai {:messages [{:role "user" :content prompt}]})))

(def TOOLS
  "All the defined tools"
  (u/index-by
   #(-> % meta :name name)
   [#'get-time
    #'convert-currency
    #'analyze-data-trend]))

(comment
  (map tool->openai (vals TOOLS)))

(comment
  ;; All examples now use standard `into` - no core.async needed!

  ;; Tool that calls back to LLM (returns reducible)
  (def q (into [] (analyze-data-trend {:metric "revenue"
                                       :values [100.0 120.0 145.0 160.0]
                                       :period "Q1 2025"})))
  (def w (into [] (tool-executor-xf TOOLS) q))
  (def e (into [] aisdk-xf w))

  ;; OpenAI with tools
  (def q (into [] (openai-raw
                   {:system "You are a data analysis assistant. When users provide time-series data and ask for insights, use the analyze-data-trend tool to generate interpretations. Always call the tool rather than making up your own analysis."
                    :input [{:role "user" :content "Can you analyze these trends? Revenue for Q1: [50000, 55000, 58000, 62000] and customer count: [100, 110, 105, 115]. What story do these numbers tell?"}]
                    :tools  (vals metabase-enterprise.metabot-v3.self/TOOLS)})))

  ;; Claude with structured output
  (def q (into [] (claude-raw
                   {:input [{:role "user" :content "Can you tell me currencies of three northmost American countries?"}]
                    :schema [:map
                             [:currencies [:sequential [:map
                                                        [:country [:string {:description "Three-letter code"}]]
                                                        [:currency [:string {:description "Three-letter code"}]]]]]]}))))

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

(defn- with-retries
  "Execute `(thunk)` with retry logic for transient LLM errors.
  Retries up to `max-llm-retries` attempts with exponential backoff."
  [thunk]
  (loop [attempt 1]
    (let [result (try
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
                         {:retry delay})
                       (throw e))))]
      (if-let [delay (:retry result)]
        (do (Thread/sleep ^long delay)
            (recur (inc attempt)))
        (:ok result)))))

(defn call-llm
  "Call an LLM and stream processed parts.

  Uses lite-aisdk-xf for fluid text streaming - emits text chunks immediately
  rather than collecting them into one large part.

  Returns a reducible that, when consumed, traces the full LLM round-trip
  (HTTP call + streaming response) as an OTel span. Retries transient errors
  (429 rate limit, 529 overloaded, connection errors) up to 3 attempts with
  exponential backoff, matching the Python ai-service retry behavior.

  When `*debug-log*` is bound, captures the request payload (system prompt,
  messages, tool names) for later inspection."
  [model system-msg messages tools]
  (log/info "Calling Claude" {:model model :msgs (count messages) :tools (count tools)})
  (let [opts (cond-> {:model model :input messages :tools (vec tools)}
               system-msg (assoc :system system-msg))
        llm-fn      (if (str/starts-with? model "claude-")
                      claude/claude
                      openai/openai)
        make-source (fn []
                      (eduction (comp (core/tool-executor-xf tools)
                                      (core/lite-aisdk-xf))
                                (llm-fn opts)))]
    ;; Wrap in a reducible that traces the entire LLM call + tool execution round-trip.
    ;; The span covers from the start of reduction (when the HTTP request fires) through
    ;; the last streamed chunk being consumed.
    ;; Retries are inside the span — each attempt gets a fresh HTTP connection.
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (with-span :info {:name       :metabot-v3.agent/call-llm
                          :model      model
                          :msg-count  (count messages)
                          :tool-count (count tools)}
          (with-retries
            #(reduce rf init (make-source))))))))
