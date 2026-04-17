(ns metabase.metabot.settings
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.provider-util :as provider-util]
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
  :getter     #(and (llm.settings/ai-features-enabled?)
                    (setting/get-value-of-type :boolean :metabot-enabled?))
  :export?    true
  :doc        false)

(defsetting embedded-metabot-enabled?
  (deferred-tru "Whether Metabot is enabled for embedding.")
  :type       :boolean
  :visibility :public
  :default    true
  :getter     #(and (llm.settings/ai-features-enabled?)
                    (setting/get-value-of-type :boolean :embedded-metabot-enabled?))
  :export?    true
  :doc        false)

;;; ------------------------------------------------- LLM Provider ------------------------------------------------

(def supported-metabot-providers
  "Set of supported LLM provider prefixes for the `llm-metabot-provider` setting."
  #{"anthropic" "openai" "openrouter" provider-util/metabase-provider-prefix})

(def ^:private direct-providers
  "Providers that can be used directly (not via the metabase/ proxy prefix)."
  #{"anthropic" "openai" "openrouter"})

(def default-llm-metabot-provider
  "Default provider/model used for Metabot when no explicit model is selected."
  "anthropic/claude-sonnet-4-6")

(def default-metabase-llm-metabot-provider
  "Managed-provider version of [[default-llm-metabot-provider]]."
  (str provider-util/metabase-provider-prefix "/" default-llm-metabot-provider))

(defn- validate-metabot-provider!
  "Validate that `value` has the format `provider/model` with a supported provider prefix.
  For `metabase/` prefix, validates the inner provider too (e.g. `metabase/anthropic/model`).
  Throws an exception with `:status-code 400` on invalid input."
  [value]
  (when-not (string? value)
    (throw (ex-info (tru "Metabot provider must be a string, got: {0}" (pr-str value))
                    {:status-code 400})))
  (let [outer-provider (provider-util/provider-and-model->outer-provider value)]
    (when-not (contains? supported-metabot-providers outer-provider)
      (throw (ex-info (tru "Unknown provider {0}. Supported providers: {1}"
                           (pr-str outer-provider) (str/join ", " (sort supported-metabot-providers)))
                      {:status-code 400
                       :provider    outer-provider
                       :supported   supported-metabot-providers})))
    (when (str/blank? (provider-util/provider-and-model->model value))
      (throw (ex-info (tru "Model name is required. Expected format: provider/model, e.g. \"anthropic/claude-haiku-4-5\"")
                      {:status-code 400
                       :value       value})))
    ;; For metabase/ prefix, validate the inner provider
    (when (= outer-provider provider-util/metabase-provider-prefix)
      (let [inner-provider (provider-util/provider-and-model->provider value)
            inner-model    (provider-util/provider-and-model->model value)]
        (when-not (contains? direct-providers inner-provider)
          (throw (ex-info (tru "Unknown inner provider {0} in metabase/ prefix. Supported: {1}"
                               (pr-str inner-provider) (str/join ", " (sort direct-providers)))
                          {:status-code 400
                           :provider    inner-provider
                           :supported   direct-providers})))
        (when (str/blank? inner-model)
          (throw (ex-info (tru "Model name is required. Expected format: metabase/provider/model, e.g. \"metabase/anthropic/claude-haiku-4-5\"")
                          {:status-code 400
                           :value       value})))))))

(defsetting llm-metabot-provider
  (deferred-tru "The AI provider and model for Metabot. Format: provider/model-name, e.g. `anthropic/claude-haiku-4-5`, `openai/gpt-4.1-mini`, `openrouter/anthropic/claude-haiku-4-5`.")
  :type             :string
  :encryption       :no
  :default          default-llm-metabot-provider
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-ai-metabot-provider
  :doc              false
  :setter           (fn [new-value]
                      (when new-value
                        (validate-metabot-provider! new-value))
                      (setting/set-value-of-type! :string :llm-metabot-provider new-value)))

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

(defn- llm-provider-configured?
  "Check if a provider-and-model string has the necessary configuration.
  For `metabase/*` providers, checks that the proxy URL is set.
  For direct providers, checks that a BYOK API key is set."
  [provider-and-model]
  (boolean
   (if (provider-util/metabase-provider? provider-and-model)
     (some? (llm.settings/llm-proxy-base-url))
     (some-> provider-and-model
             provider-util/provider-and-model->provider
             configured-provider-api-key
             token-configured?))))

(defsetting llm-metabot-configured?
  "Whether the API key for the selected Metabot provider is configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(llm-provider-configured? (llm-metabot-provider))
  :doc        false)
