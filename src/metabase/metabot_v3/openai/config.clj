(ns metabase.metabot-v3.openai.config
  (:require
   [metabase.metabot :as metabot-v2]
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]))

(def ^:dynamic ^String *api-base-url*
  "OpenAI API URL."
  "https://api.openai.com")

(defsetting metabot-v3-openai-model
  (deferred-tru "The OpenAI Model (e.g. 'gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo')")
  :encryption :no
  :visibility :settings-manager
  :default "gpt-4o-2024-08-06")

(mu/defn openai-api-key :- [:re {:error/message "API key starting with sk-"} #"^sk-"]
  "The OpenAI API Key."
  []
  (metabot-v2/openai-api-key))

(mu/defn openai-organization :- [:re {:error/message "Org ID starting with org-"} #"^org-"]
  "The OpenAI Organization ID."
  []
  (metabot-v2/openai-organization))
