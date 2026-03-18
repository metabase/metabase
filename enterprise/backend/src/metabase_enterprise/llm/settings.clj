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
  :sensitive? true
  :visibility :settings-manager
  :export? false
  :setter     (fn [new-value]
                (let [trimmed (when (string? new-value)
                                (not-empty (str/trim new-value)))]
                  (when (and trimmed (not (str/starts-with? trimmed "sk-")))
                    (throw (ex-info (tru "Invalid OpenAI API key format. Key must start with ''sk-''.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :string :ee-openai-api-key trimmed)))
  :doc false)

(defsetting ee-anthropic-api-base-url
  (deferred-tru "The Anthropic API base URL used in Metabase Enterprise.")
  :encryption :no
  :visibility :settings-manager
  :default "https://api.anthropic.com"
  :export? false
  :doc false)

(defsetting ee-anthropic-api-key
  (deferred-tru "The Anthropic API Key used in Metabase Enterprise.")
  :sensitive? true
  :visibility :settings-manager
  :export? false
  :setter     (fn [new-value]
                (let [trimmed (when (string? new-value)
                                (not-empty (str/trim new-value)))]
                  (when (and trimmed (not (str/starts-with? trimmed "sk-ant-")))
                    (throw (ex-info (tru "Invalid Anthropic API key format. Key must start with ''sk-ant-''.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :string :ee-anthropic-api-key trimmed)))
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
  :sensitive? true
  :visibility :settings-manager
  :export? false
  :setter     (fn [new-value]
                (let [trimmed (when (string? new-value)
                                (not-empty (str/trim new-value)))]
                  (when (and trimmed (not (str/starts-with? trimmed "sk-or-v1-")))
                    (throw (ex-info (tru "Invalid OpenRouter API key format. Key must start with ''sk-or-v1-''.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :string :ee-openrouter-api-key trimmed)))
  :doc false)

(def ^:private supported-metabot-providers
  "Set of supported LLM provider prefixes for the `ee-ai-metabot-provider` setting."
  #{"anthropic" "openai" "openrouter"})

(def ^:private metabot-provider-order
  ["anthropic" "openai" "openrouter"])

(def ^:private metabot-model-preset-map
  {"anthropic"  [{:priority     "high"
                  :model        "claude-opus-4-5"
                  :display_name "Claude Opus 4.5"}
                 {:priority     "medium"
                  :model        "claude-sonnet-4-5"
                  :display_name "Claude Sonnet 4.5"}
                 {:priority     "low"
                  :model        "claude-haiku-4-5"
                  :display_name "Claude Haiku 4.5"}]
   "openai"     [{:priority     "high"
                  :model        "gpt-4.1"
                  :display_name "GPT-4.1"}
                 {:priority     "medium"
                  :model        "gpt-4.1-mini"
                  :display_name "GPT-4.1 mini"}
                 {:priority     "low"
                  :model        "gpt-4.1-nano"
                  :display_name "GPT-4.1 nano"}]
   "openrouter" [{:priority     "high"
                  :model        "anthropic/claude-opus-4-5"
                  :display_name "Claude Opus 4.5"}
                 {:priority     "medium"
                  :model        "google/gemini-2.5-flash"
                  :display_name "Gemini 2.5 Flash"}
                 {:priority     "low"
                  :model        "anthropic/claude-haiku-4-5"
                  :display_name "Claude Haiku 4.5"}]})

(defn metabot-model-presets
  "Return backend-defined Metabot model presets grouped by provider."
  []
  (mapv (fn [provider]
          {:provider provider
           :presets  (get metabot-model-preset-map provider [])})
        metabot-provider-order))

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

(defsetting ee-ai-metabot-provider-lite
  (deferred-tru "The AI provider and model for lightweight Metabot tasks (e.g. user intent classification).")
  :type       :string
  :encryption :no
  :default    "openrouter/openai/gpt-oss-20b"
  :visibility :settings-manager
  :export?    false
  :doc        false
  :setter     (fn [new-value]
                (when new-value
                  (validate-metabot-provider! new-value))
                (setting/set-value-of-type! :string :ee-ai-metabot-provider-lite new-value)))

(defsetting ee-ai-metabot-internal-tasks-enabled?
  (deferred-tru "Controls whether Metabot performs internal tasks that might require background tasks or additional LLM calls (e.g. user intent classification).")
  :type       :boolean
  :visibility :settings-manager
  :default    true
  :export?    false
  :doc        false)

(defn- token-configured?
  [token]
  (boolean (and (string? token)
                (not (str/blank? token)))))

(defn- metabot-provider-prefix []
  (some-> (ee-ai-metabot-provider)
          (str/split #"/" 2)
          first))

(defn- -ee-ai-metabot-configured? []
  (case (metabot-provider-prefix)
    "anthropic"  (token-configured? (ee-anthropic-api-key))
    "openai"     (token-configured? (ee-openai-api-key))
    "openrouter" (token-configured? (ee-openrouter-api-key))
    false))

(defsetting ee-ai-metabot-configured?
  "Whether the API key for the selected Metabot provider is configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #'-ee-ai-metabot-configured?
  :doc        false)

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
