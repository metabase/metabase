(ns metabase.metabot.client
  (:require
   [cheshire.core :as json]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(def ^:dynamic *bot-endpoint*
  "The endpoint used to invoke the remote LLM"
  (fn [params options]
    (openai.api/create-chat-completion
     (select-keys params [:model :n :messages])
     options)))

(defn invoke-metabot
  "Call the bot and return the response.
  Takes messages to be used as instructions and a function that will find the first valid result from the messages."
  [{:keys [messages] :as prompt}]
  {:pre [messages]}
  (try
    (*bot-endpoint*
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
