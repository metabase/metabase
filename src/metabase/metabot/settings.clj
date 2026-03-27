(ns metabase.metabot.settings
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting metabot-id
  (deferred-tru "Override Metabot ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting metabot-enabled?
  (deferred-tru "Whether Metabot is enabled for regular usage.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)

(defsetting embedded-metabot-enabled?
  (deferred-tru "Whether Metabot is enabled for embedding.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)

;;; ------------------------------------------------- LLM Provider ------------------------------------------------

(def ^:private supported-metabot-providers
  "Set of supported LLM provider prefixes for the `llm-metabot-provider` setting."
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

(defsetting llm-metabot-provider
  (deferred-tru "The AI provider and model for Metabot. Format: provider/model-name, e.g. `anthropic/claude-haiku-4-5`, `openai/gpt-4.1-mini`, `openrouter/anthropic/claude-haiku-4-5`.")
  :type             :string
  :encryption       :no
  :default          "anthropic/claude-sonnet-4-6"
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-ai-metabot-provider
  :doc              false
  :setter           (fn [new-value]
                      (when new-value
                        (validate-metabot-provider! new-value))
                      (setting/set-value-of-type! :string :llm-metabot-provider new-value)))

(defsetting llm-metabot-provider-lite
  (deferred-tru "The AI provider and model for lightweight Metabot tasks (e.g. user intent classification).")
  :type             :string
  :encryption       :no
  :default          "anthropic/claude-haiku-4-5"
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-ai-metabot-provider-lite
  :doc              false
  :setter           (fn [new-value]
                      (when new-value
                        (validate-metabot-provider! new-value))
                      (setting/set-value-of-type! :string :llm-metabot-provider-lite new-value)))

(defsetting llm-metabot-internal-tasks-enabled?
  (deferred-tru "Controls whether Metabot performs internal tasks that might require background tasks or additional LLM calls (e.g. user intent classification).")
  :type             :boolean
  :visibility       :settings-manager
  :default          true
  :export?          false
  :deprecated-name  :ee-ai-metabot-internal-tasks-enabled?
  :doc              false)

(defn- token-configured?
  [token]
  (boolean (and (string? token)
                (not (str/blank? token)))))

(defn configured-provider-api-key
  "Returns the configured API key for the given provider, or nil if unrecognized."
  [provider]
  (case provider
    "anthropic"  (llm.settings/llm-anthropic-api-key)
    "openai"     (llm.settings/llm-openai-api-key)
    "openrouter" (llm.settings/llm-openrouter-api-key)
    nil))

(defn- metabot-provider-prefix []
  (some-> (llm-metabot-provider)
          (str/split #"/" 2)
          first))

(defn- -llm-metabot-configured? []
  (some-> (metabot-provider-prefix)
          configured-provider-api-key
          token-configured?
          boolean))

(defsetting llm-metabot-configured?
  "Whether the API key for the selected Metabot provider is configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #'-llm-metabot-configured?
  :doc        false)
