(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.analytics.core :as analytics]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   [com.knuddels.jtokkit Encodings]
   [com.knuddels.jtokkit.api Encoding EncodingType]))

(set! *warn-on-reflection* true)

(def ^:private ollama-supported-models
  "Map of supported Ollama models to their embedding dimensions."
  {"all-minilm" 384
   "mxbai-embed-large" 1024
   "nomic-embed-text" 768
   "snowflake-arctic-embed2:568m" 1024})

(def ^:private openai-supported-models
  "Map of supported OpenAI models to their embedding dimensions."
  {"text-embedding-ada-002" 1536
   "text-embedding-3-small" 1536
   "Snowflake/snowflake-arctic-embed-l-v2.0" 1024})

(def model->abbrev
  "Map of supported models to a unique abbreviation for use in index names."
  {"all-minilm" "all_minilm"
   "mxbai-embed-large" "mxbai_embed_lg"
   "nomic-embed-text" "nomic_embed_txt"
   "snowflake-arctic-embed2:568m" "snwflk_arc_embed2_568m"
   "text-embedding-ada-002" "txt_embed_ada_2"
   "text-embedding-3-small" "txt_embed_3_sm"
   "Snowflake/snowflake-arctic-embed-l-v2.0" "snwflk_arc_embedl2"})

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

(def supported-models-for-provider
  "Get all supported models for a give provider."
  {"openai" openai-supported-models
   "ollama" ollama-supported-models})

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
    ;; TODO count ollama tokens into :metabase-search/semantic-embedding-tokens?
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
        endpoint (str (semantic-settings/openai-api-base-url) "/v1/embeddings")]
    (when-not api-key
      (throw (ex-info "OpenAI API key not configured" {:setting "ee-openai-api-key"})))
    (try
      (log/debug "Calling OpenAI embeddings API" {:documents (count texts) :tokens (count-tokens-batch texts)})
      (let [response (-> (http/post endpoint
                                    {:headers {"Content-Type" "application/json"
                                               "Authorization" (str "Bearer " api-key)}
                                     :body    (json/encode {:model model-name
                                                            :input texts
                                                            :encoding_format "base64"})})
                         :body
                         (json/decode true))]
        (analytics/inc! :metabase-search/semantic-embedding-tokens
                        {:provider "openai", :model model-name}
                        (->> response :usage :total_tokens))
        (->> response
             :data
             ;; Decode base64 encoded embedding
             (map (comp vec
                        (fn [^String base64-str]
                          (let [bytes (.decode (java.util.Base64/getDecoder) base64-str)
                                buffer (java.nio.ByteBuffer/wrap bytes)
                                _ (.order buffer java.nio.ByteOrder/LITTLE_ENDIAN)
                                float-count (/ (count bytes) 4)]
                            (repeatedly float-count #(.getFloat buffer))))
                        :embedding))
             vec))
      (catch Exception e
        (log/error e "OpenAI embeddings API call failed" {:documents (count texts) :tokens (count-tokens-batch texts)})
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
(defmethod pull-model           "openai" [_] (log/debug "OpenAI provider does not require pulling a model"))

;;;; Global embedding model

(defn get-configured-model
  "Get the environments default embedding model according to the ee-embedding-provider / ee-embedding-model settings.

  Requires the model dimensions to be defined in ollama-supported-models or openai-supported-models (throws if not)."
  []
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
     :vector-dimensions vector-dimensions}))

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
  [embedding-model texts process-fn]
  (when (seq texts)
    (let [{:keys [model-name provider vector-dimensions]} embedding-model]
      (u/profile (str "Generating embeddings " {:model model-name
                                                :dimenions vector-dimensions
                                                :texts (calc-token-metrics texts)})
        (if (= "openai" provider)
          (let [max-tokens-per-batch (semantic-settings/openai-max-tokens-per-batch)
                batches (create-batches max-tokens-per-batch count-tokens texts)]
            (doseq [[batch-idx batch-texts] (map-indexed vector batches)]
              (let [embeddings (u/profile (format "Embedding batch %d/%d %s"
                                                  (inc batch-idx) (count batches) (str (calc-token-metrics batch-texts)))
                                 (openai-get-embeddings-batch model-name batch-texts))
                    text-embedding-map (zipmap batch-texts embeddings)]
                (process-fn text-embedding-map))))

          ;; No batching for other providers
          (let [embeddings (get-embeddings-batch embedding-model texts)
                text-embedding-map (zipmap texts embeddings)]
            (process-fn text-embedding-map)))))))

(comment
  ;; This gets loaded after metabase.analytics.prometheus/setup-metrics! so the known labels don't get initialized. If
  ;; we care about this, we need to ensure this namespace gets loaded before setup-metrics! is called, e.g. by requiring
  ;; this namespace in the semantic search module's init file. See https://github.com/metabase/metabase/pull/52834
  (defmethod analytics/known-labels :metabase-search/semantic-embedding-tokens
    [_]
    (for [provider (keys supported-models-for-provider)
          model (keys (supported-models-for-provider provider))]
      {:provider provider :model model})))

(comment
  ;; Configuration:
  ;; MB_EE_EMBEDDING_PROVIDER:  "openai" or "ollama" (default)
  ;; MB_EE_EMBEDDING_MODEL: optional override (leave empty for provider defaults)
  ;;   - OpenAI default: "text-embedding-3-small"
  ;;   - Ollama default: "mxbai-embed-large"
  ;; MB_EE_OPENAI_API_KEY your OpenAI API key

  (def embedding-model (get-configured-model))

  embedding-model
  (pull-model embedding-model)
  (get-embedding embedding-model "hello"))
