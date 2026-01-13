(ns metabase.llm.settings
  "Settings for OSS LLM integration."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting llm-openai-api-key
  (deferred-tru "OpenAI API key for AI-assisted SQL generation.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-openai-model
  (deferred-tru "OpenAI model for AI-assisted SQL generation (e.g., ''gpt-4o-mini'', ''gpt-4o'').")
  :encryption :no
  :visibility :settings-manager
  :default "gpt-4o-mini"
  :export? false
  :doc false)

(defn llm-enabled?
  "Returns true if LLM SQL generation is enabled (i.e., an OpenAI API key is configured)."
  []
  (some? (llm-openai-api-key)))

(defsetting llm-sql-generation-enabled
  (deferred-tru "Whether AI-assisted SQL generation is enabled.")
  :visibility :public
  :type       :boolean
  :setter     :none
  :getter     (fn [] (or (llm-enabled?) (premium-features/enable-metabot-v3?))))
