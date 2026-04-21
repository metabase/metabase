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

(defsetting metabot-name
  (deferred-tru "The display name for Metabot.")
  :type       :string
  :default    "Metabot"
  :visibility :public
  :encryption :no
  :export?    true
  :feature    :ai-controls
  :doc        false)

(defsetting metabot-icon
  (deferred-tru "The icon for Metabot.")
  :type       :string
  :default    "metabot"
  :visibility :public
  :encryption :no
  :export?    true
  :feature    :ai-controls
  :doc        false)

(defsetting metabot-show-illustrations
  (deferred-tru "Whether to show Metabot illustrations in the UI.")
  :type       :boolean
  :default    true
  :visibility :public
  :encryption :no
  :export?    true
  :feature    :ai-controls
  :doc        false)

(defsetting metabot-chat-system-prompt
  (deferred-tru "Custom system prompt for the Metabot chat (sidebar AI chat) experience.")
  :type       :string
  :default    ""
  :visibility :admin
  :encryption :no
  :export?    true
  :feature    :ai-controls
  :doc        false)

(defsetting metabot-nlq-system-prompt
  (deferred-tru "Custom system prompt for the natural language query (AI exploration) experience.")
  :type       :string
  :default    ""
  :visibility :admin
  :encryption :no
  :export?    true
  :feature    :ai-controls
  :doc        false)

(defsetting metabot-sql-system-prompt
  (deferred-tru "Custom system prompt for the SQL generation experience.")
  :type       :string
  :default    ""
  :visibility :admin
  :encryption :no
  :export?    true
  :feature    :ai-controls
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

(def ^:private direct-providers
  "Providers that can be used directly (not via the metabase/ proxy prefix)."
  #{"anthropic" "openai" "openrouter"})

(def ^:private default-anthropic-llm-metabot-model
  "Default Anthropic model used for Metabot when no explicit model is selected."
  "claude-sonnet-4-6")

(def default-llm-metabot-provider
  "Default provider/model used for Metabot when no explicit model is selected."
  (str "anthropic/" default-anthropic-llm-metabot-model))

(def default-llm-metabot-model-by-provider
  "Default model payload keyed by provider for `PUT /api/metabot/settings`.

  Values match the shape expected in the request body for each provider: direct providers use a bare model ID, while the
  managed `metabase` provider uses the proxied `provider/model` form."
  {"anthropic"                       default-anthropic-llm-metabot-model
   provider-util/metabase-provider-prefix default-llm-metabot-provider})

(def default-metabase-llm-metabot-provider
  "Managed-provider version of [[default-llm-metabot-provider]]."
  (str provider-util/metabase-provider-prefix "/" default-llm-metabot-provider))

(def ^:private proxied-providers-and-models
  "Providers and models that can be used via the metabase managed AI proxy.

  The keys of this map must be a subset of the [[direct-providers]]."
  {"anthropic" #{"claude-sonnet-4-6"}})

(def supported-metabot-providers
  "Set of supported LLM provider prefixes for the `llm-metabot-provider` setting."
  (conj direct-providers provider-util/metabase-provider-prefix))

(defn- validate-direct-provider!
  "Validate that `value` is a `provider/model` string for one of the [[direct-providers]]
  (i.e. *not* using the `metabase/` proxy prefix). Throws on invalid input."
  [value]
  (when (provider-util/metabase-provider? value)
    (throw (ex-info (tru "Invalid direct provider {0}. Must not start with {1}/."
                         (pr-str value) provider-util/metabase-provider-prefix)
                    {:status-code 400
                     :value       value})))
  (let [provider (provider-util/provider-and-model->provider value)
        model    (provider-util/provider-and-model->model value)]
    (when-not (contains? direct-providers provider)
      (throw (ex-info (tru "Unknown provider {0}. Supported providers: {1}"
                           (pr-str provider)
                           (str/join ", " (sort supported-metabot-providers)))
                      {:status-code 400
                       :provider    provider
                       :supported   supported-metabot-providers})))
    (when (str/blank? model)
      (throw (ex-info (tru "Model name is required. Expected format: provider/model, e.g. \"anthropic/claude-haiku-4-5\"")
                      {:status-code 400
                       :value       value})))))

(defn- validate-metabase-managed-provider!
  "Validate that `value` is a `metabase/provider/model` string whose inner provider and
  model are in the [[proxied-providers-and-models]] allow-list. Throws on invalid input."
  [value]
  (when-not (provider-util/metabase-provider? value)
    (throw (ex-info (tru "Invalid metabase managed AI provider {0}. Must start with {1}/."
                         (pr-str value) provider-util/metabase-provider-prefix)
                    {:status-code 400
                     :value       value})))
  (let [inner-provider    (provider-util/provider-and-model->provider value)
        inner-model       (provider-util/provider-and-model->model value)
        allowed-providers (sort (keys proxied-providers-and-models))
        allowed-models    (get proxied-providers-and-models inner-provider)]
    (when-not (contains? proxied-providers-and-models inner-provider)
      (throw (ex-info (tru "Unsupported provider {0} for metabase managed AI. Supported providers: {1}"
                           (pr-str inner-provider)
                           (str/join ", " allowed-providers))
                      {:status-code 400
                       :provider    inner-provider
                       :supported   (set (keys proxied-providers-and-models))})))
    (when (str/blank? inner-model)
      (throw (ex-info (tru "Model name is required. Expected format: metabase/provider/model, e.g. {0}"
                           (pr-str default-metabase-llm-metabot-provider))
                      {:status-code 400
                       :value       value})))
    (when-not (contains? allowed-models inner-model)
      (throw (ex-info (tru "Unsupported model {0} for metabase managed provider {1}. Supported models: {2}"
                           (pr-str inner-model)
                           (pr-str inner-provider)
                           (str/join ", " (sort allowed-models)))
                      {:status-code 400
                       :provider    inner-provider
                       :model       inner-model
                       :supported   allowed-models})))))
(defn default-model-for-provider
  "Return the default request-model payload for a provider.

  When `provider` is nil, fall back to the global default provider/model string."
  [provider]
  (if (nil? provider)
    default-llm-metabot-provider
    (get default-llm-metabot-model-by-provider provider)))

(defn- validate-metabot-provider!
  "Validate that `value` has the format `provider/model` with a supported provider prefix.
  Dispatches to [[validate-metabase-managed-provider!]] when `value` uses the
  `metabase/` proxy prefix and to [[validate-direct-provider!]] otherwise.
  Throws an exception with `:status-code 400` on invalid input."
  [value]
  (when-not (string? value)
    (throw (ex-info (tru "Metabot provider must be a string, got: {0}" (pr-str value))
                    {:status-code 400})))
  (if (provider-util/metabase-provider? value)
    (validate-metabase-managed-provider! value)
    (validate-direct-provider! value)))

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
