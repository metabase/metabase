(ns metabase-enterprise.llm.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ee-openai-model
  (deferred-tru "The OpenAI Model (e.g. ''gpt-4'', ''gpt-3.5-turbo'')")
  :encryption :no
  :visibility :settings-manager
  :default "gpt-4.1-mini"
  :export? false
  :doc false)

(defsetting ee-openai-api-base-url
  (deferred-tru "The OpenAI embeddings base URL used in Metabase Enterprise.")
  :encryption :no
  :visibility :settings-manager
  :default "https://api.openai.com"
  :export? false
  :doc false)

(defsetting ee-openai-api-key
  (deferred-tru "The OpenAI API Key used in Metabase Enterprise.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting ee-anthropic-api-base-url
  (deferred-tru "The OpenAI embeddings base URL used in Metabase Enterprise.")
  :encryption :no
  :visibility :settings-manager
  :default "https://api.anthropic.com"
  :export? false
  :doc false)

(defsetting ee-anthropic-api-key
  (deferred-tru "The Anthropic API Key used in Metabase Enterprise.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting ee-ai-features-enabled
  (deferred-tru "Enable AI features.")
  :type       :boolean
  :visibility :public
  :default false
  :export? false
  :setter (fn [new-value]
            (when (some? (ee-openai-api-key))
              (setting/set-value-of-type! :boolean :ee-ai-features-enabled new-value)))
  :doc false)
