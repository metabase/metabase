(ns metabase-enterprise.llm.settings
  (:require
   [clojure.string :as str]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

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

(defsetting ee-openrouter-api-base-url
  (deferred-tru "The OpenRouter API base URL used for Chat Completions.")
  :encryption :no
  :visibility :settings-manager
  :default "https://openrouter.ai/api"
  :export? false
  :doc false)

(defsetting ee-openrouter-api-key
  (deferred-tru "The OpenRouter API Key used in Metabase Enterprise.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :doc false)

(def ^:private supported-metabot-providers
  "Set of supported LLM provider prefixes for the `ee-ai-metabot-provider` setting."
  #{"anthropic" "openai" "openrouter"})

(defn- validate-metabot-provider!
  "Validate that `value` has the format `provider/model` with a supported provider prefix.
  Throws an exception with `:status-code 400` on invalid input."
  [value]
  (when-not (string? value)
    (throw (ex-info (tru "Metabot provider must be a string, got: {0}" (pr-str value))
                    {:status-code 400})))
  (let [[provider model] (str/split value #"/" 2)]
    (when-not (contains? supported-metabot-providers provider)
      (throw (ex-info (tru "Unknown provider {0}. Supported providers: {1}"
                           (pr-str provider) (str/join ", " (sort supported-metabot-providers)))
                      {:status-code 400
                       :provider    provider
                       :supported   supported-metabot-providers})))
    (when (str/blank? model)
      (throw (ex-info (tru "Model name is required. Expected format: provider/model, e.g. \"anthropic/claude-haiku-4-5\"")
                      {:status-code 400
                       :value       value})))))

(defsetting ee-ai-metabot-provider
  (deferred-tru "The AI provider and model for Metabot. Format: provider/model-name, e.g. `anthropic/claude-haiku-4-5`, `openai/gpt-4.1-mini`, `openrouter/anthropic/claude-haiku-4-5`.")
  :type       :string
  :encryption :no
  :default    "openrouter/anthropic/claude-haiku-4-5"
  :visibility :settings-manager
  :export?    false
  :doc        false
  :setter     (fn [new-value]
                (when new-value
                  (validate-metabot-provider! new-value))
                (setting/set-value-of-type! :string :ee-ai-metabot-provider new-value)))

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
