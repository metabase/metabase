(ns metabase-enterprise.semantic-search.settings
  (:require
   [metabase-enterprise.llm.settings :as llm-settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ee-embedding-provider
  (deferred-tru "The embedding provider to use (''openai'' or ''ollama'')")
  :encryption :no
  :visibility :settings-manager
  :default "openai"
  :export? false
  :doc "This feature is experimental.")

(defsetting ee-embedding-model
  (deferred-tru "Override the default embedding model for the selected provider")
  :encryption :no
  :visibility :settings-manager
  :default nil
  :export? false
  :doc "This feature is experimental. Leave empty to use provider defaults.")

(defn openai-api-key
  "Get the OpenAI API key from the existing LLM settings."
  []
  (llm-settings/ee-openai-api-key))

(defsetting semantic-search-enabled
  (deferred-tru "Enable the semantic search engine? Intended as a kill switch for the semantic search feature while dogfooding.")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    true
  :getter     (fn []
                (and (setting/get-value-of-type :boolean :semantic-search-enabled)
                     (premium-features/enable-semantic-search?)))
  :type       :boolean)

