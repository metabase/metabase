(ns metabase.llm.settings
  "Settings for LLM integration (API keys, model defaults, provider configuration)."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- trimmed-string
  [value]
  (when (string? value)
    (not-empty (str/trim value))))

(defn- set-prefixed-api-key!
  [setting-key prefix deferred-message new-value]
  (let [trimmed (trimmed-string new-value)]
    (when (and trimmed (not (str/starts-with? trimmed prefix)))
      (throw (ex-info (str deferred-message) {:status-code 400})))
    (setting/set-value-of-type! :string setting-key trimmed)))

;;; ------------------------------------------------- Anthropic -------------------------------------------------

(defsetting llm-anthropic-api-key
  (deferred-tru "The Anthropic API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-anthropic-api-key
  :setter           (partial set-prefixed-api-key!
                             :llm-anthropic-api-key
                             "sk-ant-"
                             (deferred-tru "Invalid Anthropic API key format. Key must start with ''sk-ant-''."))
  :doc false)

(defsetting llm-anthropic-api-key-configured?
  "Whether an Anthropic API key has been configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(boolean (some? (llm-anthropic-api-key)))
  :doc        false)

(defsetting llm-anthropic-model
  (deferred-tru "The Anthropic model to use.")
  :encryption :no
  :visibility :settings-manager
  :default "claude-opus-4-5-20251101"
  :export? false
  :doc false)

(defsetting llm-anthropic-api-base-url
  (deferred-tru "The Anthropic API base URL.")
  :encryption       :no
  :visibility       :settings-manager
  :default          "https://api.anthropic.com"
  :export?          false
  :deprecated-name  :ee-anthropic-api-base-url
  :doc              false)

(defsetting llm-anthropic-api-version
  (deferred-tru "The Anthropic API version.")
  :encryption :no
  :visibility :internal
  :default "2023-06-01"
  :export? false
  :doc false)

;;; -------------------------------------------------- OpenAI ---------------------------------------------------

(defsetting llm-openai-model
  (deferred-tru "The OpenAI Model (e.g. ''gpt-4'', ''gpt-3.5-turbo'')")
  :encryption       :no
  :visibility       :settings-manager
  :default          "gpt-4.1-mini"
  :export?          false
  :deprecated-name  :ee-openai-model
  :doc              false)

(defsetting llm-openai-api-base-url
  (deferred-tru "The OpenAI API base URL.")
  :encryption       :no
  :visibility       :settings-manager
  :default          "https://api.openai.com"
  :export?          false
  :deprecated-name  :ee-openai-api-base-url
  :doc              false)

(defsetting llm-openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-openai-api-key
  :setter           (partial set-prefixed-api-key!
                             :llm-openai-api-key
                             "sk-"
                             (deferred-tru "Invalid OpenAI API key format. Key must start with ''sk-''."))
  :doc              false)

;;; ------------------------------------------------- OpenRouter ------------------------------------------------

(defsetting llm-openrouter-api-base-url
  (deferred-tru "The OpenRouter API base URL used for Chat Completions.")
  :encryption       :no
  :visibility       :settings-manager
  :default          "https://openrouter.ai/api"
  :export?          false
  :deprecated-name  :ee-openrouter-api-base-url
  :doc              false)

(defsetting llm-openrouter-api-key
  (deferred-tru "The OpenRouter API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-openrouter-api-key
  :setter           (partial set-prefixed-api-key!
                             :llm-openrouter-api-key
                             "sk-or-v1-"
                             (deferred-tru "Invalid OpenRouter API key format. Key must start with ''sk-or-v1-''."))
  :doc              false)

;;; --------------------------------------------------- Proxy ---------------------------------------------------

(defsetting llm-proxy-base-url
  (deferred-tru "Base URL for the LLM proxy. When set, requests to the managed Metabase AI service are routed through this proxy and authenticated with the instance token instead of a provider API key.")
  :enabled?         #(or (premium-features/has-feature? :metabase-ai-managed)
                         (premium-features/has-feature? :metabot-v3))
  :encryption       :no
  :visibility       :internal
  :default          nil
  :export?          false
  :doc              false)

(defsetting ai-service-base-url
  (deferred-tru "Base URL for the managed Metabase AI service.")
  :enabled?         #(or (premium-features/has-feature? :metabase-ai-managed)
                         (premium-features/has-feature? :metabot-v3))
  :encryption       :no
  :visibility       :internal
  :default          nil
  :export?          false
  :doc              false)

(defsetting llm-proxy-configured?
  (deferred-tru "Whether the LLM proxy is configured for the managed Metabase AI service.")
  :encryption       :no
  :visibility       :settings-manager
  :export?          false
  :setter           :none
  :getter           #(boolean (some? (llm-proxy-base-url)))
  :doc              false)

;;; -------------------------------------------------- General --------------------------------------------------

(defsetting ai-features-enabled?
  (deferred-tru "Whether AI features are enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)

(defsetting llm-max-tokens
  (deferred-tru "Maximum tokens for LLM responses.")
  :type :integer
  :default 4096
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-request-timeout-ms
  (deferred-tru "Socket timeout in milliseconds for LLM API requests.")
  :type :integer
  :default 60000
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-connection-timeout-ms
  (deferred-tru "Connection timeout in milliseconds for LLM API requests.")
  :type :integer
  :default 5000
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-rate-limit-per-user
  (deferred-tru "Maximum SQL generation requests per user per minute.")
  :type :integer
  :default 20
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-rate-limit-per-ip
  (deferred-tru "Maximum SQL generation requests per IP address per minute.")
  :type :integer
  :default 100
  :visibility :settings-manager
  :export? false
  :doc false)
