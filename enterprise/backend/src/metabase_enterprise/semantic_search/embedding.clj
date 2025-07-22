(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
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

(def default-model-for-provider
  "Get the default model for a given provider."
  {"openai" "text-embedding-3-small"
   "ollama" "mxbai-embed-large"})

;;;; Provider SPI

(defn- dispatch-provider [embedding-model & _] (:provider embedding-model))

(defmulti get-embedding
  "Returns a single embedding vector for the given text"
  {:arglists '([embedding-model text])} dispatch-provider)

(defmulti get-embeddings-batch
  "Returns a sequential collection of embedding vectors, in the same order as the input texts."
  {:arglists '([embedding-model texts])} dispatch-provider)

(defmulti pull-model
  "If a model needs to be downloaded (which is the case for ollama), downloads it."
  {:arglists '([embedding-model])} dispatch-provider)

;;;; Ollama impl

(defn- ollama-get-embedding [model-name text]
  (try
    (log/debug "Generating Ollama embedding for text of length:" (count text))
    (-> (http/post "http://localhost:11434/api/embeddings"
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
    (http/post "http://localhost:11434/api/pull"
               {:headers {"Content-Type" "application/json"}
                :body    (json/encode {:model model-name})})
    (catch Exception e
      (log/error e "Failed to pull embedding model")
      (throw e))))

(defmethod get-embedding        "ollama" [{:keys [model-name]} text] (ollama-get-embedding model-name text))
(defmethod get-embeddings-batch "ollama" [{:keys [model-name]} text] (ollama-get-embeddings-batch model-name text))
(defmethod pull-model           "ollama" [{:keys [model-name]}]      (ollama-pull-model model-name))

;;;; OpenAI impl

(defn- openai-get-embeddings-batch [model-name texts]
  (let [api-key (semantic-settings/openai-api-key)
        endpoint "https://api.openai.com/v1/embeddings"]
    (when-not api-key
      (throw (ex-info "OpenAI API key not configured" {:setting "ee-openai-api-key"})))
    (try
      (log/debug "Generating" (count texts) "OpenAI embeddings in batch")
      (-> (http/post endpoint
                     {:headers {"Content-Type" "application/json"
                                "Authorization" (str "Bearer " api-key)}
                      :body    (json/encode {:model model-name
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

(defn- openai-get-embedding [model-name text]
  (try
    (log/debug "Generating OpenAI embedding for text of length:" (count text))
    (first (openai-get-embeddings-batch model-name text))
    (catch Exception e
      (log/error e "Failed to generate OpenAI embedding for text of length:" (count text))
      (throw e))))

(defmethod get-embedding        "openai" [{:keys [model-name]} text] (openai-get-embedding model-name text))
(defmethod get-embeddings-batch "openai" [{:keys [model-name]} text] (openai-get-embeddings-batch model-name text))
(defmethod pull-model           "openai" [_] (log/info "OpenAI provider does not require pulling a model"))

;;;; Global embedding model

(def ^:dynamic ^:redef *active-model*
  "The model being used by the current semantic search engine."
  nil)

(defn get-active-model
  "Returns *active-model* if defined.

  Otherwise get the environments default embedding model according to the ee-embedding-provider / ee-embedding-model settings.

  Requires the model dimensions are defined in ollama-supported-models or openai-supported-models (throws if not)."
  []
  (or *active-model*
      (let [provider (semantic-settings/ee-embedding-provider)
            models (case provider
                     "ollama" ollama-supported-models
                     "openai" openai-supported-models
                     (throw (ex-info (format "Unknown embedding provider: %s" provider) {:provider provider})))
            model-name (or (semantic-settings/ee-embedding-model) (default-model-for-provider provider))
            vector-dimensions (or (get models model-name)
                                  (throw (ex-info (format "Not a supported model: %s" model-name) {:provider provider, :model-name model-name})))]
        {:provider provider
         :model-name model-name
         :vector-dimensions vector-dimensions})))

(defn process-embeddings-streaming
  "Process texts in provider-appropriate batches, calling process-fn for each batch. process-fn will be called with
  [texts embeddings] for each batch."
  [embedding-model texts process-fn]
  (when (seq texts)
    (let [{:keys [model-name provider]} embedding-model]
      (if (= "openai" provider)
        ;; For OpenAI, use token-aware batching and stream processing
        (let [batches (create-batches (semantic-settings/openai-max-tokens-per-batch) count-tokens texts)]
          (run! (fn [batch-texts]
                  (let [embeddings (openai-get-embeddings-batch model-name batch-texts)]
                    (process-fn batch-texts embeddings)))
                batches))
        ;; For other providers, process all at once (existing behavior)
        (let [embeddings (get-embeddings-batch embedding-model texts)]
          (process-fn texts embeddings))))))

(comment
  ;; Configuration:
  ;; MB_EE_EMBEDDING_PROVIDER:  "openai" or "ollama" (default)
  ;; MB_EE_EMBEDDING_MODEL: optional override (leave empty for provider defaults)
  ;;   - OpenAI default: "text-embedding-3-small"
  ;;   - Ollama default: "mxbai-embed-large"
  ;; MB_EE_OPENAI_API_KEY your OpenAI API key

  (def embedding-model (get-active-model))

  embedding-model
  (pull-model embedding-model)
  (get-embedding embedding-model "hello"))
