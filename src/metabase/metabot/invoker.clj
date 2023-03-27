(ns metabase.metabot.invoker
  (:require
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(def num-choices 3)

(defsetting is-metabot-enabled
  (deferred-tru "Is Metabot enabled?")
  :type :boolean
  :visibility :authenticated
  :default true)

(defsetting openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :visibility :settings-manager)

(defsetting openai-organization
  (deferred-tru "The OpenAPI Organization ID.")
  :visibility :settings-manager)

(defn find-result [{:keys [choices]} message-fn]
  (some
   (fn [{:keys [message]}]
     (when-some [res (message-fn (:content message))]
       res))
   choices))

(defn ^:dynamic invoke-metabot
  "Call the bot and return the reponse.
  Takes messages to be used as instructions and a function that will find the first valid result from the messages."
  [messages extract-response-fn]
  (when (and
         (openai-api-key)
         (openai-organization))
    (let [resp (openai.api/create-chat-completion
                {:model    "gpt-3.5-turbo"
                 ;; Just produce a single result
                 :n        num-choices
                 ; Note - temperature of 0 is deterministic, so n > 1 will return n identical items
                 ; :temperature 0
                 :messages messages
                 ;:messages (prepare-sql-generator-input model prompt)
                 }
                {:api-key      (openai-api-key)
                 :organization (openai-organization)})]
      (tap> {:openai-response resp})
      (find-result resp extract-response-fn))))
