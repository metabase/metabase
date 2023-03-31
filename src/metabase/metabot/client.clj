(ns metabase.metabot.client
  (:require
   [clojure.string :as str]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(def num-choices 3)

(defn find-result
  "Given a set of choices returned from the bot, find the first one returned by
   the supplied message-fn."
  [{:keys [choices]} message-fn]
  (or
   (some
    (fn [{:keys [message]}]
      (when-some [res (message-fn (:content message))]
        res))
    choices)
   (log/info
    "Unable to find appropriate result for user prompt in responses:\n\t%s"
    (str/join "\n\t" (map (fn [m] (get-in m [:message :content])) choices)))))

(defn ^:dynamic invoke-metabot
  "Call the bot and return the response.
  Takes messages to be used as instructions and a function that will find the first valid result from the messages."
  [messages extract-response-fn]
  (try
    (let [resp (openai.api/create-chat-completion
                {:model    (metabot-settings/openai-model)
                 :n        num-choices
                 :messages messages}
                {:api-key      (metabot-settings/openai-api-key)
                 :organization (metabot-settings/openai-organization)})]
      (tap> {:openai-response resp})
      (find-result resp extract-response-fn))
    (catch Exception e
      (throw (ex-info
              (ex-message e)
              {:exception-data (ex-data e)
               :status-code    400})))))
