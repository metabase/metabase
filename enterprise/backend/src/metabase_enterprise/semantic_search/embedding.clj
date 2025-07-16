(ns metabase-enterprise.semantic-search.embedding
  (:require
   [clj-http.client :as http]
   [environ.core :refer [env]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(defn pull-model
  "Pull the current embedding model from Ollama if it is not already available."
  []
  (try
    (log/info "Pulling embedding model from Ollama...")
    (http/post (str (env :ollama-url "http://localhost:11434") "/api/pull")
               {:headers {"Content-Type" "application/json"}
                :body    (json/encode {:model (env :ollama-model "mxbai-embed-large")})})
    (catch Exception e
      (log/error e "Failed to pull embedding model")
      (throw e))))

(defn get-embedding
  "Generate or retrieve an embedding for the given text. "
  [text]
  (try
    (log/info "Generating embedding for text of length:" (count text))
    (-> (http/post (str (env :ollama-url "http://localhost:11434") "/api/embeddings")
                   {:headers {"Content-Type" "application/json"}
                    :body    (json/encode {:model (env :ollama-model "mxbai-embed-large")
                                           :prompt text})})
        :body
        (json/decode true)
        :embedding)
    (catch Exception e
      (log/error e "Failed to generate embedding for text of length:" (count text))
      (throw e))))

(comment
  (pull-model)
  (get-embedding "hello"))
