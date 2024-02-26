(ns metabase-enterprise.llm.settings
  (:require
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ee-openai-model
  (deferred-tru "The OpenAI Model (e.g. 'gpt-4', 'gpt-3.5-turbo')")
  :visibility :settings-manager
  :default "gpt-4-turbo-preview"
  :export? false)

(defsetting ee-openai-api-key
  (deferred-tru "The OpenAI API Key used in Metabase Enterprise.")
  :visibility :settings-manager
  :export? false)
