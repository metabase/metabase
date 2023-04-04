(ns metabase.metabot.client
  (:require
   [clojure.pprint :as pprint]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(def ^:dynamic bot-endpoint
  "The endpoint used to invoke the remote LLM"
  openai.api/create-chat-completion)

(defn invoke-metabot
  "Call the bot and return the response.
  Takes messages to be used as instructions and a function that will find the first valid result from the messages."
  [messages]
  (try
    (bot-endpoint
     {:model    (metabot-settings/openai-model)
      :n        (metabot-settings/num-metabot-choices)
      :messages messages}
     {:api-key      (metabot-settings/openai-api-key)
      :organization (metabot-settings/openai-organization)})
    (catch Exception e
      (log/warn "Exception when calling invoke-metabot: %s" (.getMessage e))
      (when (ex-data e)
        #_{:clj-kondo/ignore [:discouraged-var]}
        (log/warnf "Exception data:\n%s" (with-out-str (pprint/pprint (ex-data e)))))
      (throw
       ;; If we have ex-data, we'll assume were intercepting an openai.api/create-chat-completion response
       (if-some [status (:status (ex-data e))]
         (case (int status)
           401 (ex-info
                "Bot credentials are incorrect or not set.\nCheck with your administrator that the correct API keys are set."
                {:message     "Bot credentials are incorrect or not set.\nCheck with your administrator that the correct API keys are set."
                 ;; Don't actually produce a 401 becuase you'll get redirect do the home page.
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
