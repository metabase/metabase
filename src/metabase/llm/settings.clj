(ns metabase.llm.settings
  "Settings for OSS LLM integration."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting llm-anthropic-api-key
  (deferred-tru "Anthropic API key for AI-assisted SQL generation.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-anthropic-model
  (deferred-tru "Anthropic model for AI-assisted SQL generation.")
  :encryption :no
  :visibility :settings-manager
  :default "claude-sonnet-4-20250514"
  :export? false
  :doc false)

(defn llm-enabled?
  "Returns true if LLM SQL generation is enabled (i.e., an Anthropic API key is configured)."
  []
  (some? (llm-anthropic-api-key)))

(defsetting llm-sql-generation-enabled
  (deferred-tru "Whether AI-assisted SQL generation is enabled.")
  :visibility :public
  :type       :boolean
  :setter     :none
  :getter     (fn [] (or (llm-enabled?) (premium-features/enable-metabot-v3?))))
