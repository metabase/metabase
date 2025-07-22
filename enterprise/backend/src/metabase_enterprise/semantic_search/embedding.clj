(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [potemkin.types :as p])
  (:import
   [com.knuddels.jtokkit Encodings]
   [com.knuddels.jtokkit.api Encoding EncodingType]))

(set! *warn-on-reflection* true)

(def ^:private ollama-supported-models
  "Map of supported Ollama models to their embedding dimensions."
  {"mxbai-embed-large" 1024
   "nomic-embed-text" 768
   "all-minilm" 384})

(def ^:private openai-supported-models
  "Map of supported OpenAI models to their embedding dimensions."
  {"text-embedding-3-small" 1536
   "text-embedding-3-large" 3072
   "text-embedding-ada-002" 1536})

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

(defn- default-model-for-provider
  "Get the default model for a given provider."
  [provider-key]
  (case provider-key
    :openai "text-embedding-3-small"
    :ollama "mxbai-embed-large"
    nil))

(defn- get-model
  "Get the model to use for the current provider, either the default or an override from settings."
  []
  (let [provider-key (semantic-settings/ee-embedding-provider)
        override-model (semantic-settings/ee-embedding-model)]
    (if-not (str/blank? override-model)
      override-model
      (default-model-for-provider provider-key))))

(p/defprotocol+ EmbeddingProvider
  "Protocol for embedding providers."
  (-get-embedding [provider text]
    "Generate an embedding vector for the given text.")
  (-get-embeddings-batch [provider texts]
    "Generate embedding vectors for multiple texts in a single API call.
     Returns a vector of embeddings in the same order as the input texts.")
  (-pull-model [provider]
    "Pull/download the embedding model if needed (no-op for cloud providers).")
  (-model-dimensions [provider model]
    "Return the number of dimensions for this provider's embeddings given a model name."))

(p/defrecord+ OllamaProvider []
  EmbeddingProvider
  (-get-embedding [_ text]
    (try
      (log/debug "Generating Ollama embedding for text of length:" (count text))
      (-> (http/post "http://localhost:11434/api/embeddings"
                     {:headers {"Content-Type" "application/json"}
                      :body    (json/encode {:model (get-model)
                                             :prompt text})})
          :body
          (json/decode true)
          :embedding)
      (catch Exception e
        (log/error e "Failed to generate Ollama embedding for text of length:" (count text))
        (throw e))))

  (-get-embeddings-batch [this texts]
    ;; Ollama doesn't have a native batch API, so we fall back to individual calls
    ;; No special batching needed for Ollama - just process all texts
    (log/debug "Generating" (count texts) "Ollama embeddings (using individual calls)")
    (mapv #(-get-embedding this %) texts))

  (-pull-model [_]
    (try
      (log/debug "Pulling embedding model from Ollama...")
      (http/post "http://localhost:11434/api/pull"
                 {:headers {"Content-Type" "application/json"}
                  :body    (json/encode {:model (get-model)})})
      (catch Exception e
        (log/error e "Failed to pull embedding model")
        (throw e))))

  (-model-dimensions [_ model]
    (get ollama-supported-models model)))

(defrecord OpenAIProvider []
  EmbeddingProvider
  (-get-embedding [this text]
    (try
      (log/debug "Generating OpenAI embedding for text of length:" (count text))
      (first (-get-embeddings-batch this [text]))
      (catch Exception e
        (log/error e "Failed to generate OpenAI embedding for text of length:" (count text))
        (throw e))))

  (-get-embeddings-batch [_ texts]
    (let [api-key (semantic-settings/openai-api-key)
          model (get-model)
          endpoint "https://api.openai.com/v1/embeddings"]
      (when-not api-key
        (throw (ex-info "OpenAI API key not configured" {:setting "ee-openai-api-key"})))
      (try
        (log/debug "Generating" (count texts) "OpenAI embeddings in batch")
        (-> (http/post endpoint
                       {:headers {"Content-Type" "application/json"
                                  "Authorization" (str "Bearer " api-key)}
                        :body    (json/encode {:model model
                                               :input texts})})
            :body
            (json/decode true)
            :data
            (->> (map :embedding)
                 vec))
        (catch Exception e
          (log/error e "Failed to generate OpenAI embeddings for batch of" (count texts) "texts"
                     "with token count:" (count-tokens-batch texts))
          (throw e)))))

  (-pull-model [_]
    (log/info "OpenAI provider does not require pulling a model"))

  (-model-dimensions [_ model]
    (get openai-supported-models model)))

(def ^:private providers
  "Registry of available embedding providers."
  {:ollama (->OllamaProvider)
   :openai (->OpenAIProvider)})

(defn get-provider
  "Get the configured embedding provider according to the ee-embedding-provider setting"
  []
  (let [provider-key (keyword (semantic-settings/ee-embedding-provider))]
    (if-let [provider (get providers provider-key)]
      provider
      (throw (ex-info (str "Unknown embedding provider: " provider-key)
                      {:provider provider-key
                       :available-providers (keys providers)})))))

(defn get-embedding
  "Generate a single embedding using the configured provider. Prefer using `process-embeddings-streaming` for bulk index population."
  [text]
  (-get-embedding (get-provider) text))

(defn pull-model
  "Pull/download the model using the configured provider."
  []
  (-pull-model (get-provider)))

(defn model-dimensions
  "Get the number of dimensions for the configured provider and model."
  ([]
   (let [provider (get-provider)
         model (get-model)]
     (-model-dimensions provider model)))
  ([model]
   (-model-dimensions (get-provider) model)))

;; TODO: dedupe embedding fetching for identical values
(defn process-embeddings-streaming
  "Process texts in provider-appropriate batches, calling process-fn for each batch. process-fn will be called with
  [texts embeddings] for each batch."
  [texts process-fn]
  (when (seq texts)
    (let [provider (get-provider)]
      (if (instance? OpenAIProvider provider)
        ;; For OpenAI, use token-aware batching and stream processing
        (let [batches (create-batches (semantic-settings/openai-max-tokens-per-batch) count-tokens texts)]
          (run! (fn [batch-texts]
                  (let [embeddings (-get-embeddings-batch provider batch-texts)]
                    (process-fn batch-texts embeddings)))
                batches))
        ;; For other providers, process all at once (existing behavior)
        (let [embeddings (-get-embeddings-batch provider texts)]
          (process-fn texts embeddings))))))

(comment
  ;; Configuration:
  ;; MB_EE_EMBEDDING_PROVIDER:  "openai" or "ollama" (default)
  ;; MB_EE_EMBEDDING_MODEL: optional override (leave empty for provider defaults)
  ;;   - OpenAI default: "text-embedding-3-small"
  ;;   - Ollama default: "mxbai-embed-large"
  ;; MB_EE_OPENAI_API_KEY your OpenAI API key

  (pull-model)
  (get-embedding "hello")
  (model-dimensions)
  (get-model))
