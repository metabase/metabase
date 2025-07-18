(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [potemkin.types :as p]))

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
  (-pull-model [provider]
    "Pull/download the embedding model if needed (no-op for cloud providers).")
  (-model-dimensions [provider model]
    "Return the number of dimensions for this provider's embeddings given a model name."))

(p/defrecord+ OllamaProvider []
  EmbeddingProvider
  (-get-embedding [_ text]
    (try
      (log/info "Generating Ollama embedding for text of length:" (count text))
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

  (-pull-model [_]
    (try
      (log/info "Pulling embedding model from Ollama...")
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
  (-get-embedding [_ text]
    (try
      (log/info "Generating OpenAI embedding for text of length:" (count text))
      (let [api-key (semantic-settings/openai-api-key)
            model (get-model)
            endpoint "https://api.openai.com/v1/embeddings"]
        (when-not api-key
          (throw (ex-info "OpenAI API key not configured" {:setting "ee-openai-api-key"})))
        (-> (http/post endpoint
                       {:headers {"Content-Type" "application/json"
                                  "Authorization" (str "Bearer " api-key)}
                        :body    (json/encode {:model model
                                               :input text})})
            :body
            (json/decode true)
            (get-in [:data 0 :embedding])))
      (catch Exception e
        (log/error e "Failed to generate OpenAI embedding for text of length:" (count text))
        (throw e))))

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
  "Generate an embedding using the configured provider."
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
