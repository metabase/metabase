(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [diehard.circuit-breaker :as dh.cb]
   [diehard.core :as dh]
   [flatland.ordered.set :refer [ordered-set]]
   [metabase-enterprise.semantic-search.models.token-tracking :as semantic.models.token-tracking]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.llm.settings :as llm.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   [com.knuddels.jtokkit Encodings]
   [com.knuddels.jtokkit.api Encoding EncodingType]
   [dev.failsafe CircuitBreakerOpenException FailsafeException]
   [java.net ConnectException]))

(set! *warn-on-reflection* true)

(defn ^:private clean-model-name
  "Clean up a model name to make it friendly for use in index names."
  [model-name]
  (-> model-name
      (str/split #"/")
      last
      (str/replace #"[-:.]" "_")))

(def ^:private model-abbreviations {"small" "sm" "medium" "md" "large" "lg" "tiny" "tn"})

(defn abbrev-model-name
  "Abbreviate long model names for use in index names."
  [model-name]
  (-> model-name
      clean-model-name
      (str/replace #"embedding|embed" "")
      ((fn [s] (reduce-kv str/replace s model-abbreviations)))
      (str/replace #"_{2,}" "_")
      (str/replace #"^_+|_+$" "")))

(defn clean-provider-name
  "Clean up a provider names for use in index names."
  [provider-name]
  (str/replace provider-name #"[-:.]" "_"))

(defn abbrev-provider-name
  "Abbreviate long provider names for use in index names."
  [provider-name]
  (case provider-name
    "ai-service" "ais"
    (clean-provider-name provider-name)))

;;; Token Counting for OpenAI Models

(def ^:private ^Encoding openai-encoding
  "OpenAI tokenizer encoding for cl100k_base (used by text-embedding models)."
  (delay (.getEncoding (Encodings/newDefaultEncodingRegistry) EncodingType/CL100K_BASE)))

(defn- count-tokens
  "Count the number of tokens in a text string using OpenAI's cl100k_base encoding."
  [^String text]
  (when text
    (let [^Encoding encoding @openai-encoding]
      (.size (.encode encoding text)))))

(defn- count-tokens-batch
  "Count the total number of tokens across multiple text strings."
  [texts]
  (reduce + 0 (map count-tokens texts)))

(defn- decode-embeddings
  "Decode OpenAI base64 response"
  [data]
  (vec
   (for [{:keys [embedding]} data]
     (let [bytes  (u/decode-base64-to-bytes ^String embedding)
           buffer (doto (java.nio.ByteBuffer/wrap bytes)
                    (.order java.nio.ByteOrder/LITTLE_ENDIAN))
           length (/ (alength bytes) 4)
           _      (when-not (int? length)
                    (throw (ex-info "Invalid base64 length, not divisible by 4" {:length (alength bytes)})))
           result (float-array length)]
       (.get (.asFloatBuffer buffer) result)
       result))))

;;; Batching Logic

(defn- create-batches
  "Split texts into batches that don't exceed the threshold.
   Returns a vector of batches, where each batch is a vector of texts.
   - threshold: Maximum allowed measure per batch
   - measure: Function to measure each text (e.g., count-tokens)
   - texts: Collection of texts to batch"
  [threshold measure texts]
  (let [step (fn [{:keys [current-batch current-measure batches] :as acc} text]
               (let [text-measure (measure text)]
                 (cond
                   ;; Single text exceeds the limit - skip it with warning
                   ;; TODO (Chris 2026-06-29) -- silently dropping an over-budget doc here is a poor default —
                   ;; it vanishes from the index with only a warning. Make the over-budget policy a per-call
                   ;; option (:truncate / :skip / :error, likely truncate-by-default eventually) and check what
                   ;; the ai-service path does, which bypasses create-batches entirely.
                   ;; https://linear.app/metabase/issue/BOT-1742
                   (> text-measure threshold)
                   (do
                     (log/warn
                      (format "Skipping text that exceeds maximum measure per batch: %s"
                              (str (subs text 0 (min 10 (count text))) "..."))
                      {:measure text-measure :threshold threshold})
                     acc)

                   ;; Adding this text would exceed the limit - start new batch
                   (> (+ current-measure text-measure) threshold)
                   (assoc acc
                          :current-batch [text]
                          :current-measure text-measure
                          :batches (conj batches current-batch))

                   ;; Add to current batch
                   :else
                   (assoc acc
                          :current-batch (conj current-batch text)
                          :current-measure (+ current-measure text-measure)))))
        {:keys [batches current-batch]}
        (reduce step
                {:current-batch [] :current-measure 0 :batches []}
                texts)]
    (if (seq current-batch)
      (conj batches current-batch)
      batches)))

;;;; Provider SPI

(defn- dispatch-provider [embedding-model & _] (:provider embedding-model))

(defmulti get-embedding
  "Returns a single embedding vector for the given text.
  `opts` (kwargs, honoured by the production providers; ollama ignores them):
  - `:record-tokens?` — write a token-tracking row for the call
  - `:type`           — what the embedding is for (`:query`/`:index`), recorded with the tokens
  - `:snowplow?`      — ai-service only, default true; synthetic callers (e.g. the health probe) pass
                        false so the call emits no token_usage event"
  {:arglists '([embedding-model text & opts])} dispatch-provider)

(defmulti get-embeddings-batch
  "Returns a sequential collection of embedding vectors, in the same order as the input texts.
  Takes the same `opts` as [[get-embedding]], minus `:snowplow?` (batch callers are all organic)."
  {:arglists '([embedding-model texts & opts])} dispatch-provider)

(defmulti pull-model
  "If a model needs to be downloaded (which is the case for ollama), downloads it."
  {:arglists '([embedding-model])} dispatch-provider)

;;;; Embedding-service circuit breaker
;;;
;;; The embedding service is a remote HTTP dependency; when it's down, every semantic-search / NLQ query
;;; would otherwise re-attempt (and re-time-out) against it. A circuit breaker fails fast after repeated
;;; failures, and its state doubles as a health signal: an open breaker means real traffic is currently
;;; failing. State transitions surface the affected health checks immediately (see the listeners) rather
;;; than waiting for the daily job. Thresholds are fixed (the breaker is built once); the setting is a
;;; runtime kill switch checked per call.

(def ^:private embedder-circuit-breaker-failure-threshold
  "Consecutive embedding-service failures that trip the breaker open." 5)

(def ^:private embedder-circuit-breaker-success-threshold
  "Consecutive successes in half-open that close the breaker again." 2)

(def ^:private embedder-circuit-breaker-delay-ms
  "How long the breaker stays open before it allows a half-open trial call." 30000)

(def ^:private embedding-http-timeouts
  "clj-http timeout opts merged into every embedding-service request. Without an explicit :socket-timeout the
  client waits forever, so a blackholed service (accepts connections, never responds) would hang callers
  indefinitely -- and the breaker would never open, since only completed failures count toward it."
  {:connection-timeout 10000
   :socket-timeout     60000})

(defonce ^{:doc "Insertion-ordered set of `(fn [state])` hooks run on every breaker state change.
  Health namespaces `conj` a hook here (inverting the dep -- they require this module) to re-persist their
  embedder-dependent check on a transition, so an outage or recovery surfaces in minutes, not the next daily report.
  Ordered-set: `conj` is reload-idempotent and load-ordered, so the semantic hook clears the probe cache
  before the NLQ hook reads it. Register a var so a REPL redef takes effect live."}
  embedder-circuit-state-change-hooks
  (atom (ordered-set)))

(defn- on-embedder-circuit-state-change!
  "Run the registered [[embedder-circuit-state-change-hooks]] off the failsafe callback thread, in
  registration order, each isolated so one failing hook doesn't starve the rest."
  [state]
  ;; Log level tracks the resulting state's severity:
  ;;   :open      -> WARN  (degradation)
  ;;   :half-open -> INFO  (probing)
  ;;   :closed    -> INFO  (recovered)
  ;; Recovery is still captured level-independently -- the hooks below persist a health row per transition.
  (if (= :open state)
    (log/warn "Embedding service circuit breaker opened" {:state state})
    (log/info "Embedding service circuit breaker changed state" {:state state}))
  (future
    (doseq [hook @embedder-circuit-state-change-hooks]
      (try
        (hook state)
        (catch Throwable e
          (log/error e "Embedder circuit state-change hook failed"))))))

(defonce ^:private embedder-circuit-breaker
  ;; No failure condition, so every embedding-call failure counts toward opening the breaker. That suits an
  ;; embedder whose failures are almost all service-wide -- network, 5xx, a 429 throttle storm, or auth on
  ;; the shared instance credentials -- where backing off is the right response.
  (dh.cb/circuit-breaker
   {:failure-threshold embedder-circuit-breaker-failure-threshold
    :success-threshold embedder-circuit-breaker-success-threshold
    :delay-ms          embedder-circuit-breaker-delay-ms
    :on-open      (fn [_] (on-embedder-circuit-state-change! :open))
    :on-half-open (fn [_] (on-embedder-circuit-state-change! :half-open))
    :on-close     (fn [_] (on-embedder-circuit-state-change! :closed))}))

(def ^:dynamic *bypass-circuit-breaker*
  "Bind true to run an embedding call without consulting or tripping the breaker.
  The health probe binds it so the probe stays an independent signal and can't flip the breaker from inside
  a state-change listener (which would recurse)."
  false)

(defn embedder-circuit-state
  "Current embedder circuit-breaker state: `:closed`, `:open`, or `:half-open`."
  []
  (dh.cb/state embedder-circuit-breaker))

(defn embedder-circuit-open?
  "Whether the breaker is enabled and currently open -- i.e. real embedding calls are being short-circuited.
  False when the breaker is disabled, since calls then bypass it and a stale open state is irrelevant."
  []
  (and (semantic-settings/semantic-search-embedder-circuit-breaker-enabled)
       (= :open (embedder-circuit-state))))

(defn embedder-circuit-untrusted?
  "Whether the breaker is enabled and not closed -- i.e. open or half-open, so it doesn't yet trust the
  embedding service (open short-circuits calls; half-open is on a single trial).
  False when the breaker is disabled, since calls then bypass it."
  []
  (and (semantic-settings/semantic-search-embedder-circuit-breaker-enabled)
       (not= :closed (embedder-circuit-state))))

(defn- call-through-embedder-breaker
  "Run `thunk` under the embedder circuit breaker, unless it is bypassed (probe) or disabled (kill switch).
  An open circuit throws a 502 `ex-info` with `:cause :embedder/circuit-open`; any other failure propagates
  unwrapped. `endpoint` (optional) is echoed into the circuit-open ex-data so it carries the same `:endpoint`
  the connection-refused path does (there is no wrapped cause on a short-circuit -- nothing was called)."
  [thunk & {:keys [endpoint]}]
  (if (or *bypass-circuit-breaker*
          (not (semantic-settings/semantic-search-embedder-circuit-breaker-enabled)))
    (thunk)
    (try
      (dh/with-circuit-breaker embedder-circuit-breaker (thunk))
      (catch CircuitBreakerOpenException _
        ;; Mirror the connection-refused 502 shape so callers already handling embedder-down keep working.
        (throw (ex-info "embedding service unavailable (circuit open)"
                        (cond-> {:status 502, :cause :embedder/circuit-open}
                          endpoint (assoc :endpoint endpoint)))))
      ;; Diehard wraps a thunk failure in FailsafeException; unwrap so callers see the original.
      (catch FailsafeException e
        (throw (or (.getCause e) e))))))

;;;; Ollama impl

(def ^:private ollama-embeddings-endpoint
  "http://localhost:11434/api/embeddings") ;; TODO: we should make the host configurable

(defn- ollama-get-embedding [model-name text]
  (try
    ;; TODO count ollama tokens into :metabase-search/semantic-embedding-tokens?
    (log/debug "Generating Ollama embedding for text of length:" (count text))
    (-> (http/post ollama-embeddings-endpoint
                   (merge embedding-http-timeouts
                          {:headers {"Content-Type" "application/json"}
                           :body    (json/encode {:model model-name
                                                  :prompt text})}))
        :body
        (json/decode true)
        :embedding)
    (catch Exception e
      (log/error e "Failed to generate Ollama embedding for text of length:" (count text))
      (throw e))))

(defn- ollama-pull-model [model-name]
  (try
    (log/debug "Pulling embedding model from Ollama...")
    (http/post "http://localhost:11434/api/pull" ;; TODO: make the host configurable
               (merge embedding-http-timeouts
                      {:headers {"Content-Type" "application/json"}
                       :body    (json/encode {:model model-name})}))
    (catch Exception e
      (log/error e "Failed to pull embedding model")
      (throw e))))

;; Ollama is not used in production. Token tracking is not implemented.
(defmethod get-embedding "ollama" [{:keys [model-name]} text & {:as _opts}]
  (call-through-embedder-breaker #(ollama-get-embedding model-name text)
                                 :endpoint ollama-embeddings-endpoint))

(defmethod get-embeddings-batch "ollama" [{:keys [model-name]} texts & {:as _opts}]
  ;; Ollama doesn't have a native batch API, so we fall back to individual calls. Each call goes through the
  ;; breaker on its own, so an outage mid-batch fast-fails the remaining texts instead of timing out on each.
  (log/debug "Generating" (count texts) "Ollama embeddings (using individual calls)")
  (mapv (fn [text]
          (call-through-embedder-breaker #(ollama-get-embedding model-name text)
                                         :endpoint ollama-embeddings-endpoint))
        texts))

(defmethod pull-model "ollama" [{:keys [model-name]}] (ollama-pull-model model-name))

;;;; OpenAI-compatible embedding service impl (shared by "ai-service" and "openai" providers)

(defn- supports-dimensions?
  "Check whether the model's API supports dimensions in request's body. At the time of writing supported on OpenAI's
  text-embedding-3-small and text-embedding-3-large. Should be supported also on newer models when those are out."
  [{:keys [model-name] :as _embedding-model}]
  (boolean
   (when (string? model-name)
     (str/starts-with? model-name "text-embedding-3"))))

(mu/defn- openai-compatible-get-embeddings-batch*
  "Raw OpenAI-compatible /v1/embeddings call, without the circuit breaker. Callers go through
  [[openai-compatible-get-embeddings-batch]]; the health probe reaches this path via the bypass flag.

  `:provider`        — label for analytics (e.g. \"ai-service\", \"openai\")
  `:endpoint`        — full URL including /v1/embeddings
  `:api-key`         — Bearer token. If empty ai service proxying is assumed and premium-embedding-token is
                       used for authentication
  `:model-name`      — model identifier sent in the request body
  `:texts`           — collection of input strings
  `:record-tokens?`  — true writes a `semantic_search_token_tracking` row, false skips it.
  `:snowplow?`       — optional; when true fires a Snowplow `token_usage` event
  `:extra-body`      — optional; merged into the request body (e.g. `{:dimensions 1024}`)
  `:type`            — optional; forwarded to the token-tracking row"
  [{:keys [provider endpoint api-key model-name texts record-tokens? extra-body snowplow?] :as opts}
   :- [:map
       [:provider       :string]
       [:endpoint       :string]
       [:api-key        {:optional true} [:maybe :string]]
       [:model-name     :string]
       [:texts          [:sequential :string]]
       [:record-tokens? :boolean]
       [:snowplow?      {:optional true} [:maybe :boolean]]
       [:extra-body     {:optional true} [:maybe :map]]]]
  (try
    (log/debug (str "Calling " provider " embeddings API")
               {:endpoint endpoint :documents (count texts) :tokens (count-tokens-batch texts)})
    (let [start-ms             (u/start-timer)
          {:keys [usage data]} (-> (http/post endpoint
                                              (merge
                                               embedding-http-timeouts
                                               {:headers
                                                (merge {"Content-Type"  "application/json"}
                                                       (if (and (empty? api-key)
                                                                (= "ai-service" provider))
                                                         {"x-metabase-instance-token"
                                                          (u/prog1 (premium-features/premium-embedding-token)
                                                            (when (nil? <>)
                                                              (throw (ex-info "Premium embedding token not set"
                                                                              {:provider provider}))))}
                                                         {"Authorization" (str "Bearer " api-key)}))
                                                :body    (json/encode (merge {:model           model-name
                                                                              :input           texts
                                                                              :encoding_format "base64"}
                                                                             extra-body))}))
                                   :body
                                   (json/decode true))
          total-tokens         (:total_tokens usage 0)
          prompt-tokens        (:prompt_tokens usage total-tokens)]
      (analytics/inc! :metabase-search/semantic-embedding-tokens
                      {:provider provider :model model-name}
                      total-tokens)
      (when snowplow?
        (analytics.core/track-token-usage!
         {:snowplow            true
          :prometheus          false    ; already tracked via inc! above
          :request-id          (analytics.core/uuid->ai-service-hex-uuid (random-uuid))
          :model-id            model-name
          :total-tokens        total-tokens
          :prompt-tokens       prompt-tokens
          :completion-tokens   0        ; embedding models don't produce completion tokens
          :estimated-costs-usd 0.0
          :duration-ms         (long (u/since-ms start-ms))
          :tag                 "embedding_generation"}))
      (when record-tokens?
        (semantic.models.token-tracking/record-tokens model-name (:type opts) total-tokens))
      (decode-embeddings data))
    (catch ConnectException e
      (log/error e (str "Failed to connect to " provider) {:endpoint endpoint})
      (throw (ex-info (str provider " unavailable (connection refused)")
                      {:status 502 :endpoint endpoint}
                      e)))
    (catch Exception e
      (log/error e (str provider " embeddings API call failed")
                 {:documents (count texts) :tokens (count-tokens-batch texts)})
      (throw e))))

(defn- openai-compatible-get-embeddings-batch
  "Circuit-breaker-guarded entry point to the OpenAI-compatible embeddings call (see
  [[openai-compatible-get-embeddings-batch*]] for the argument contract)."
  [opts]
  (call-through-embedder-breaker #(openai-compatible-get-embeddings-batch* opts)
                                 :endpoint (:endpoint opts)))

;;;; Embedding-service provider

(defn- trim-trailing-slashes
  [s]
  (cond-> s
    (string? s) (-> (str/trim)
                    (str/replace #"/+$" ""))))

(defn- embedding-service-resolve-config!
  "Returns [endpoint api-key]. When api key is not set or when service url is not set but
  `llm.settings/ai-service-base-url` is set the ai service proxying is assumed. In that case premium-embedding-token
  is used for authentication. Throws if neither base URL is configured."
  []
  (cond (string? (not-empty (semantic-settings/ee-embedding-service-base-url)))
        [(str (trim-trailing-slashes (semantic-settings/ee-embedding-service-base-url)) "/v1/embeddings")
         (semantic-settings/ee-embedding-service-api-key)]

        (string? (not-empty (llm.settings/ai-service-base-url)))
        [(str (trim-trailing-slashes (llm.settings/ai-service-base-url)) "/v1/embeddings")
         nil]

        :else
        (throw (ex-info "Embedding service and ai service base URLs are not configured"
                        {:settings ["ee-embedding-service-base-url"
                                    "ai-service-base-url"]}))))

(defmethod get-embedding "ai-service"
  [{:keys [model-name]} text & {:keys [record-tokens? type snowplow?] :or {snowplow? true}}]
  (let [[endpoint api-key] (embedding-service-resolve-config!)]
    (first (openai-compatible-get-embeddings-batch
            {:provider       "ai-service"
             :endpoint       endpoint
             :api-key        api-key
             :model-name     model-name
             :texts          [text]
             :snowplow?      snowplow?
             :record-tokens? record-tokens?
             :type           type}))))

(defmethod get-embeddings-batch "ai-service"
  [{:keys [model-name]} texts & {:keys [record-tokens? type]}]
  (let [[endpoint api-key] (embedding-service-resolve-config!)]
    (openai-compatible-get-embeddings-batch
     {:provider       "ai-service"
      :endpoint       endpoint
      :api-key        api-key
      :model-name     model-name
      :texts          texts
      :snowplow?      true
      :record-tokens? record-tokens?
      :type           type})))

(defmethod pull-model "ai-service" [_]
  (log/debug "ai-service provider does not require pulling a model"))

;;;; OpenAI provider

(defn- openai-resolve-config!
  "Returns [endpoint api-key] or throws if not configured."
  []
  (let [api-key (semantic-settings/openai-api-key)]
    (when-not api-key
      (throw (ex-info "OpenAI API key not configured" {:setting "llm-openai-api-key"})))
    [(str (semantic-settings/openai-api-base-url) "/v1/embeddings") api-key]))

(defmethod get-embedding "openai"
  [embedding-model text & {:keys [record-tokens? type]}]
  (let [[endpoint api-key] (openai-resolve-config!)]
    (first (openai-compatible-get-embeddings-batch
            {:provider       "openai"
             :endpoint       endpoint
             :api-key        api-key
             :model-name     (:model-name embedding-model)
             :texts          [text]
             :record-tokens? record-tokens?
             :extra-body     (when (supports-dimensions? embedding-model)
                               {:dimensions (:vector-dimensions embedding-model)})
             :type           type}))))

(defmethod get-embeddings-batch "openai"
  [embedding-model texts & {:keys [record-tokens? type]}]
  (let [[endpoint api-key] (openai-resolve-config!)]
    (openai-compatible-get-embeddings-batch
     {:provider       "openai"
      :endpoint       endpoint
      :api-key        api-key
      :model-name     (:model-name embedding-model)
      :texts          texts
      :record-tokens? record-tokens?
      :extra-body     (when (supports-dimensions? embedding-model)
                        {:dimensions (:vector-dimensions embedding-model)})
      :type           type})))

(defmethod pull-model "openai" [_]
  (log/debug "OpenAI provider does not require pulling a model"))

;;;; Query prefixes for asymmetric retrieval models

(def ^:private model-family-query-prefixes
  "Query prefixes for embedding-model families trained for asymmetric retrieval.
  These models expect search queries — but not the indexed documents — to carry a fixed prefix."
  ;; Patterns must be mutually exclusive: lookup scans entries in unspecified order.
  ;; Keep patterns narrow: a false positive is unfixable without a code change, since the
  ;; `ee-embedding-query-prefix` setting can only replace a matched prefix, never suppress it.
  {#"(?i)snowflake-arctic-embed" "query: "})

(defn- default-query-prefix
  [model-name]
  (when model-name
    (some (fn [[pattern prefix]]
            (when (re-find pattern model-name)
              prefix))
          model-family-query-prefixes)))

(defn prefix-search-query
  "Prepend the query prefix expected by `embedding-model` to `search-string`.
  The `ee-embedding-query-prefix` setting overrides the per-model-family default and is prepended verbatim.
  Returns `search-string` unchanged when neither applies."
  [embedding-model search-string]
  (str (or (not-empty (semantic-settings/ee-embedding-query-prefix))
           (default-query-prefix (:model-name embedding-model)))
       search-string))

;;;; Global embedding model

(defn get-configured-model
  "Get the environments default embedding model according to the ee-embedding-provider / ee-embedding-model settings."
  []
  {:provider (semantic-settings/ee-embedding-provider)
   :model-name (semantic-settings/ee-embedding-model)
   :vector-dimensions (semantic-settings/ee-embedding-model-dimensions)})

(defmulti embedding-supported?
  "Whether `embedding-model`'s provider is *configured* to compute embeddings — the endpoint/credentials it
  needs are present. This is a config-presence check, not a liveness probe: a set URL whose service is down
  (or a stopped ollama) still reads as supported and surfaces at call time. Dispatches on provider,
  mirroring [[get-embedding]] and the config each provider's impl resolves; a new provider — including a
  future in-process embedder — adds a method. The `:default` is false, so an unrecognized provider gates
  callers off safely."
  {:arglists '([embedding-model])} dispatch-provider)

(defmethod embedding-supported? :default [_] false)

(defmethod embedding-supported? "ai-service" [_]
  (boolean (or (not-empty (semantic-settings/ee-embedding-service-base-url))
               (not-empty (llm.settings/ai-service-base-url)))))

(defmethod embedding-supported? "openai" [_]
  (boolean (not-empty (semantic-settings/openai-api-key))))

;; ollama's endpoint is hardcoded (localhost:11434) with no setting to check, so config-presence is always
;; true — consistent with ai-service/openai, which likewise check for a configured URL, not a live server.
(defmethod embedding-supported? "ollama" [_] true)

(defn- calc-token-metrics
  [texts]
  (let [counts  (map count-tokens texts)
        avg-raw (/ (reduce + counts) (count counts))]
    {:n   (count texts)
     :min (apply min counts)
     :max (apply max counts)
     :sum (reduce + counts)
     :avg (parse-double (format "%.2f" (double avg-raw)))}))

(defn process-embeddings-streaming
  "Process texts in provider-appropriate batches, calling process-fn for each batch. process-fn will be called with
  a map from text to embedding for each batch."
  [embedding-model texts process-fn & {:as opts}]
  (when (seq texts)
    (let [{:keys [model-name provider vector-dimensions]} embedding-model]
      (tracing/with-span :search "search.semantic.embeddings-batch"
        {:search.semantic/provider   provider
         :search.semantic/model-name model-name
         :search.semantic/text-count (count texts)}
        (u/profile (str "Generating embeddings " {:model model-name
                                                  :dimensions vector-dimensions
                                                  :texts (calc-token-metrics texts)})
          (if (= "openai" provider)
            (let [max-tokens-per-batch (semantic-settings/openai-max-tokens-per-batch)
                  batches (create-batches max-tokens-per-batch count-tokens texts)

                  process-batch
                  (fn [batch-idx batch-texts]
                    (let [embeddings (u/profile (format "Embedding batch %d/%d %s"
                                                        (inc batch-idx) (count batches) (str (calc-token-metrics batch-texts)))
                                       (get-embeddings-batch embedding-model batch-texts opts))
                          text-embedding-map (zipmap batch-texts embeddings)]
                      (process-fn text-embedding-map)))]
              (transduce (map-indexed process-batch) (partial merge-with +) batches))
            (let [embeddings (get-embeddings-batch embedding-model texts opts)
                  text-embedding-map (zipmap texts embeddings)]
              (process-fn text-embedding-map))))))))

(comment
  ;; Configuration:
  ;; MB_EE_EMBEDDING_PROVIDER:  "ai-service" (default), "openai", or "ollama"
  ;; MB_EE_EMBEDDING_MODEL: optional override (leave empty for provider defaults)
  ;;   - OpenAI default: "text-embedding-3-small"
  ;;   - Ollama default: "mxbai-embed-large"
  ;; MB_EE_EMBEDDING_SERVICE_BASE_URL: URL of the embedding service (for ai-service provider)
  ;; MB_EE_EMBEDDING_SERVICE_API_KEY: API key for the embedding service
  ;; MB_EE_OPENAI_API_KEY: your OpenAI API key (for openai provider)
  ;; MB_EE_EMBEDDING_MODEL_DIMENSIONS: defaults to 1024.

  (def embedding-model (get-configured-model))
  embedding-model
  (pull-model embedding-model)
  (get-embedding embedding-model "hello"))
