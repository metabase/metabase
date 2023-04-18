(ns metabase.metabot.client
  (:require
   [cheshire.core :as json]
   [clojure.core.memoize :as memoize]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(defn- default-chat-completion-endpoint
  "OpenAI is the default completion endpoint"
  [params options]
  (openai.api/create-chat-completion
   (select-keys params [:model :n :messages])
   options))

(def ^:dynamic ^{:arglists '([params options])}
  *create-chat-completion-endpoint*
  "The endpoint used to invoke the remote LLM"
  default-chat-completion-endpoint)

(defn invoke-metabot
  "Call the bot and return the response.
  Takes messages to be used as instructions and a function that will find the first valid result from the messages."
  [{:keys [messages] :as prompt}]
  {:pre [messages]}
  (try
    (*create-chat-completion-endpoint*
     (merge
      {:model (metabot-settings/openai-model)
       :n     (metabot-settings/num-metabot-choices)}
      prompt)
     {:api-key      (metabot-settings/openai-api-key)
      :organization (metabot-settings/openai-organization)})
    (catch Exception e
      (log/warnf "Exception when calling invoke-metabot: %s" (.getMessage e))
      (throw
        ;; If we have ex-data, we'll assume were intercepting an openai.api/create-chat-completion response
        (if-some [status (:status (ex-data e))]
          (case (int status)
            400 (let [{:keys [body]} (ex-data e)
                      {:keys [error]} (json/parse-string body keyword)
                      {:keys [message code]} error]
                  (log/warnf "%s: %s" code message)
                  (ex-info
                    message
                    {:message     message
                     :status-code 400}))
            401 (ex-info
                  "Bot credentials are incorrect or not set.\nCheck with your administrator that the correct API keys are set."
                  {:message     "Bot credentials are incorrect or not set.\nCheck with your administrator that the correct API keys are set."
                   ;; Don't actually produce a 401 because you'll get redirect do the home page.
                   :status-code 400})
            429 (ex-info
                  "The bot server is under heavy load and cannot process your request at this time.\nPlease try again."
                  {:message     "The bot server is under heavy load and cannot process your request at this time.\nPlease try again."
                   :status-code status})
            ;; Just re-throw it until we get a better handle on
            (ex-info
              "Error calling remote bot server.\nPlease try again."
              {:message     "The bot server is under heavy load and cannot process your request at this time.\nPlease try again."
               :status-code 500}))
          ;; If there's no ex-data, we'll assume it's some other issue and generate a 400
          (ex-info
            (ex-message e)
            {:exception-data (ex-data e)
             :status-code    400}))))))

(defn- default-embedding-endpoint
  "OpenAI is the default completion endpoint\""
  [params options]
  (openai.api/create-embedding
   (select-keys params [:model :input])
   options))

(def ^:dynamic ^{:arglists '([params options])}
  *create-embedding-endpoint*
  "Default embeddings endpoint is both dynamic and memoized."
  (memoize/ttl
    ^{::memoize/args-fn (fn create-embeddings-memoize-fn [[{:keys [model input]} _options]] [model input])}
    default-embedding-endpoint
    ;; 24-hour ttl
    :ttl/threshold (* 1000 60 60 24)))

(defn create-embedding
  "Create an embedding vector from the given prompt.
  This response with the original prompt, the embedding vector, and the token count of the embeddings.
  The token count can be used to provide best fit queries for prompts requiring large amounts of data."
  ([model prompt]
   (log/info "Creating embedding...")
   (let [{[{:keys [embedding]}]   :data
          {:keys [prompt_tokens]} :usage} (*create-embedding-endpoint*
                                            {:model model
                                             :input prompt}
                                            {:api-key      (metabot-settings/openai-api-key)
                                             :organization (metabot-settings/openai-organization)})]
     {:prompt    prompt
      :embedding embedding
      :tokens    prompt_tokens}))
  ([prompt]
   (create-embedding (metabot-settings/metabot-default-embedding-model) prompt)))
