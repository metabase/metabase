(ns metabase-enterprise.llm.settings
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ee-openai-model
  (deferred-tru "The OpenAI Model (e.g. 'gpt-4', 'gpt-3.5-turbo')")
  :visibility :settings-manager
  :default "gpt-4-turbo-preview"
  :export? false
  :doc "This feature is experimental.")

(defsetting ee-openai-api-key
  (deferred-tru "The OpenAI API Key used in Metabase Enterprise.")
  :visibility :settings-manager
  :export? false
  :doc "This feature is experimental.")

(defsetting ee-ai-features-enabled
  (deferred-tru "Enable AI features.")
  :type       :boolean
  :visibility :public
  :default false
  :export? false
  :setter (fn [new-value]
            (when (some? (ee-openai-api-key))
              (setting/set-value-of-type! :boolean :ee-ai-features-enabled new-value)))
  :doc "This feature is experimental.")
