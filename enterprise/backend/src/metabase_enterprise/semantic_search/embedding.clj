(ns metabase-enterprise.semantic-search.embedding
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.tools.logging :as log]
   [environ.core :refer [env]]))

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
        (json/parse-string true)
        :embedding)
    (catch Exception e
      (log/error e "Failed to generate embedding for text of length:" (count text))
      (throw e))))

(comment
  (pull-model)
  (get-embedding "hello"))
