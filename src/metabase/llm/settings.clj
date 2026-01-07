(ns metabase.llm.settings
  "Settings for MiniBot LLM integration (OSS)."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting minibot-openai-api-key
  (deferred-tru "OpenAI API key for MiniBot text-to-SQL feature.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting minibot-openai-model
  (deferred-tru "OpenAI model for MiniBot (e.g., ''gpt-4o-mini'', ''gpt-4o'').")
  :encryption :no
  :visibility :settings-manager
  :default "gpt-4o-mini"
  :export? false
  :doc false)

(defn minibot-enabled?
  "Returns true if MiniBot is enabled (i.e., an OpenAI API key is configured)."
  []
  (some? (minibot-openai-api-key)))
