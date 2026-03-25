(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.models.token-tracking :as semantic.models.token-tracking]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.analytics.core :as analytics]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   [com.knuddels.jtokkit Encodings]
   [com.knuddels.jtokkit.api Encoding EncodingType]
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
                   (> text-measure threshold)
                   (do
                     (log/warn
                      (format "Skipping text that exceeds maximum measure per batch: %s"
                              (str (subs text 0 10) "..."))
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
  "Returns a single embedding vector for the given text"
  {:arglists '([embedding-model text & opts])} dispatch-provider)

(defmulti get-embeddings-batch
  "Returns a sequential collection of embedding vectors, in the same order as the input texts."
  {:arglists '([embedding-model texts & opts])} dispatch-provider)

(defmulti pull-model
  "If a model needs to be downloaded (which is the case for ollama), downloads it."
  {:arglists '([embedding-model])} dispatch-provider)

;;;; Ollama impl

(defn- ollama-get-embedding [model-name text]
  (try
    ;; TODO count ollama tokens into :metabase-search/semantic-embedding-tokens?
    (log/debug "Generating Ollama embedding for text of length:" (count text))
    (-> (http/post "http://localhost:11434/api/embeddings" ;; TODO: we should make the host configurable
                   {:headers {"Content-Type" "application/json"}
                    :body    (json/encode {:model model-name
                                           :prompt text})})
        :body
        (json/decode true)
        :embedding)
    (catch Exception e
      (log/error e "Failed to generate Ollama embedding for text of length:" (count text))
      (throw e))))

(defn- ollama-get-embeddings-batch [model-name texts]
  ;; Ollama doesn't have a native batch API, so we fall back to individual calls
  ;; No special batching needed for Ollama - just process all texts
  (log/debug "Generating" (count texts) "Ollama embeddings (using individual calls)")
  (mapv #(ollama-get-embedding model-name %) texts))

(defn- ollama-pull-model [model-name]
  (try
    (log/debug "Pulling embedding model from Ollama...")
    (http/post "http://localhost:11434/api/pull" ;; TODO: make the host configurable
               {:headers {"Content-Type" "application/json"}
                :body    (json/encode {:model model-name})})
    (catch Exception e
      (log/error e "Failed to pull embedding model")
      (throw e))))

;; Ollama is not used in production. Token tracking is not implemented.
(defmethod get-embedding        "ollama" [{:keys [model-name]} text & {:as _opts}]  (ollama-get-embedding model-name text))
(defmethod get-embeddings-batch "ollama" [{:keys [model-name]} texts & {:as _opts}] (ollama-get-embeddings-batch model-name texts))
(defmethod pull-model           "ollama" [{:keys [model-name]}]       (ollama-pull-model model-name))

;;;; OpenAI-compatible embedding service impl (shared by "ai-service" and "openai" providers)

(defn- supports-dimensions?
  "Check whether the model's API supports dimensions in request's body. At the time of writing supported on OpenAI's
  text-embedding-3-small and text-embedding-3-large. Should be supported also on newer models when those are out."
  [{:keys [model-name] :as _embedding-model}]
  (boolean
   (when (string? model-name)
     (str/starts-with? model-name "text-embedding-3"))))

(defn- openai-compatible-get-embeddings-batch
  "Call an OpenAI-compatible /v1/embeddings endpoint. Shared implementation for both
  the `ai-service` and `openai` providers.

  `provider`   — label for analytics (e.g. \"ai-service\", \"openai\")
  `endpoint`   — full URL including /v1/embeddings
  `api-key`    — Bearer token
  `model-name` — model identifier sent in the request body
  `texts`      — collection of input strings
  `opts`       — keyword opts; `:type` is forwarded to token tracking,
                 `:extra-body` is merged into the request body (e.g. {:dimensions 1024}),
                 `:snowplow?` when true fires a Snowplow token_usage event"
  [provider endpoint api-key model-name texts
   & {:keys [extra-body snowplow?] :as opts}]
  (try
    (log/debug (str "Calling " provider " embeddings API")
               {:endpoint endpoint :documents (count texts) :tokens (count-tokens-batch texts)})
    (let [start-ms             (u/start-timer)
          {:keys [usage data]} (-> (http/post endpoint
                                              {:headers {"Content-Type"  "application/json"
                                                         "Authorization" (str "Bearer " api-key)}
                                               :body    (json/encode (merge {:model           model-name
                                                                             :input           texts
                                                                             :encoding_format "base64"}
                                                                            extra-body))})
                                   :body
                                   (json/decode true))
          total-tokens         (:total_tokens usage 0)
          prompt-tokens        (:prompt_tokens usage total-tokens)]
      (analytics/inc! :metabase-search/semantic-embedding-tokens
                      {:provider provider :model model-name}
                      total-tokens)
      (when snowplow?
        (analytics/track-token-usage!
         {:snowplow            true
          :prometheus          false    ; already tracked via inc! above
          :request-id          (analytics/uuid->ai-service-hex-uuid (random-uuid))
          :model-id            model-name
          :total-tokens        total-tokens
          :prompt-tokens       prompt-tokens
          :completion-tokens   0        ; embedding models don't produce completion tokens
          :estimated-costs-usd 0.0
          :duration-ms         (long (u/since-ms start-ms))
          :tag                 "embedding_generation"}))
      (semantic.models.token-tracking/record-tokens model-name (:type opts) total-tokens)
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

;;;; Embedding-service provider

(defn- embedding-service-resolve-config!
  "Returns [endpoint api-key] or throws if not configured."
  []
  (let [base-url (semantic-settings/ee-embedding-service-base-url)
        api-key  (semantic-settings/ee-embedding-service-api-key)]
    (when-not base-url
      (throw (ex-info "Embedding service base URL not configured"
                      {:setting "ee-embedding-service-base-url"})))
    (when-not api-key
      (throw (ex-info "Embedding service API key not configured"
                      {:setting "ee-embedding-service-api-key"})))
    [(str base-url "/v1/embeddings") api-key]))

(defmethod get-embedding "ai-service" [{:keys [model-name]} text & {:as opts}]
  (let [[endpoint api-key] (embedding-service-resolve-config!)]
    (first (openai-compatible-get-embeddings-batch
            "ai-service" endpoint api-key model-name [text]
            (assoc opts :snowplow? true)))))

(defmethod get-embeddings-batch "ai-service" [{:keys [model-name]} texts & {:as opts}]
  (let [[endpoint api-key] (embedding-service-resolve-config!)]
    (openai-compatible-get-embeddings-batch
     "ai-service" endpoint api-key model-name texts
     (assoc opts :snowplow? true))))

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

(defmethod get-embedding "openai" [embedding-model text & {:as opts}]
  (let [[endpoint api-key] (openai-resolve-config!)]
    (first (openai-compatible-get-embeddings-batch
            "openai" endpoint api-key (:model-name embedding-model) [text]
            (assoc opts :extra-body (when (supports-dimensions? embedding-model)
                                      {:dimensions (:vector-dimensions embedding-model)}))))))

(defmethod get-embeddings-batch "openai" [embedding-model texts & {:as opts}]
  (let [[endpoint api-key] (openai-resolve-config!)]
    (openai-compatible-get-embeddings-batch
     "openai" endpoint api-key (:model-name embedding-model) texts
     (assoc opts :extra-body (when (supports-dimensions? embedding-model)
                               {:dimensions (:vector-dimensions embedding-model)})))))

(defmethod pull-model "openai" [_]
  (log/debug "OpenAI provider does not require pulling a model"))

;;;; Global embedding model

(defn get-configured-model
  "Get the environments default embedding model according to the ee-embedding-provider / ee-embedding-model settings."
  []
  {:provider (semantic-settings/ee-embedding-provider)
   :model-name (semantic-settings/ee-embedding-model)
   :vector-dimensions (semantic-settings/ee-embedding-model-dimensions)})

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
