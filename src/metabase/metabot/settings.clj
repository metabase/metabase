(ns metabase.metabot.settings
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]))

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
  :export?    true)

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
  :export?    true)

(defsetting metabot-recent-views-enabled?
  (deferred-tru "Whether the user''s recently viewed items are included in the Metabot system prompt.")
  :type       :boolean
  :visibility :internal
  :default    true
  :export?    false)

;;; ------------------------------------------------- LLM Provider ------------------------------------------------

(def ^:private direct-providers
  "Providers that can be used directly (not via the metabase/ proxy prefix)."
  #{"anthropic" "azure" "bedrock" "openai" "openrouter"})

(def ^:private default-anthropic-llm-metabot-model
  "Default Anthropic model used for Metabot when no explicit model is selected."
  "claude-sonnet-4-6")

(def ^:private default-bedrock-llm-metabot-model
  "Default Bedrock model used for Metabot when no explicit model is selected."
  "anthropic.claude-opus-4-8")

(def default-llm-metabot-provider
  "Default provider/model used for Metabot when no explicit model is selected."
  (str "anthropic/" default-anthropic-llm-metabot-model))

(def default-llm-metabot-model-by-provider
  "Default model payload keyed by provider for `PUT /api/metabot/settings`.

  Values match the shape expected in the request body for each provider: direct providers use a bare model ID, while the
  managed `metabase` provider uses the proxied `provider/model` form."
  {"anthropic"                            default-anthropic-llm-metabot-model
   "bedrock"                              default-bedrock-llm-metabot-model
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

(def azure-model-families
  "Wire-protocol families for models hosted on Azure: the first segment of the azure model
  string `{family}/{deployment-name}`, selecting the Anthropic or OpenAI wire protocol."
  #{"anthropic" "openai"})

(defn validate-azure-model!
  "Validate the model segment of an `azure/{family}/{deployment-name}` provider string:
  a supported wire family followed by a non-blank deployment name without slashes
  (Azure deployment names cannot contain `/`). Throws on invalid input."
  [value model]
  (let [[family deployment] (str/split (str model) #"/" 2)]
    (when-not (and (contains? azure-model-families family)
                   (not (str/blank? deployment))
                   (not (str/includes? deployment "/")))
      (throw (ex-info (tru "Invalid Azure model {0}. Expected format: azure/<family>/<deployment-name> where <family> is one of: {1}"
                           (pr-str value)
                           (str/join ", " (sort azure-model-families)))
                      {:status-code 400
                       :value       value})))))

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
                       :value       value})))
    (when (= provider "azure")
      (validate-azure-model! value model))))

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
  :setter           (fn [new-value]
                      (when new-value
                        (validate-metabot-provider! new-value))
                      (setting/set-value-of-type! :string :llm-metabot-provider new-value)))

(defn- non-blank
  [value]
  (when (string? value)
    (let [trimmed (str/trim value)]
      (when-not (str/blank? trimmed)
        trimmed))))

(defn- configured-api-key-credentials
  [api-key]
  (when-let [k (non-blank api-key)]
    {:api-key k}))

(defn configured-provider-credentials
  "Returns the configured credentials map for the given provider, or nil if unrecognized or unconfigured.

  The shape of the map varies by provider: API-key providers return `{:api-key ...}`, Azure returns `:api-key` and
  `:base-url` from the `llm-azure-*` settings, and Bedrock returns `:access-key-id`, `:secret-access-key`,
  `:session-token`, and `:region` from the `llm-bedrock-*` settings. Azure counts as configured only when both the
  API key and base URL are set; Bedrock only when both the access key ID and secret access key are set."
  [provider]
  (case provider
    "anthropic"  (configured-api-key-credentials (llm.settings/llm-anthropic-api-key))
    "azure"      (let [api-key  (non-blank (llm.settings/llm-azure-api-key))
                       base-url (non-blank (llm.settings/llm-azure-api-base-url))]
                   (when (and api-key base-url)
                     {:api-key api-key :base-url base-url}))
    "bedrock"    (when (llm.settings/llm-bedrock-configured?)
                   {:access-key-id     (non-blank (llm.settings/llm-bedrock-access-key-id))
                    :secret-access-key (non-blank (llm.settings/llm-bedrock-secret-access-key))
                    :session-token     (non-blank (llm.settings/llm-bedrock-session-token))
                    :region            (non-blank (llm.settings/llm-bedrock-region))})
    "openai"     (configured-api-key-credentials (llm.settings/llm-openai-api-key))
    "openrouter" (configured-api-key-credentials (llm.settings/llm-openrouter-api-key))
    nil))

(defn provider-credentials-complete?
  "Whether a credentials map carries everything `provider` needs to make requests: both the AWS access key ID and
  secret access key for Bedrock, both the API key and base URL for Azure, an `:api-key` for the other direct
  providers."
  [provider credentials]
  (boolean
   (case provider
     "bedrock" (and (non-blank (:access-key-id credentials))
                    (non-blank (:secret-access-key credentials)))
     "azure"   (and (non-blank (:api-key credentials))
                    (non-blank (:base-url credentials)))
     (non-blank (:api-key credentials)))))

(defn- llm-provider-configured?
  "Check if a provider-and-model string has the necessary configuration.
  For `metabase/*` providers, checks that the proxy URL is set.
  For direct providers, checks that credentials are configured (see [[configured-provider-credentials]])."
  [provider-and-model]
  (boolean
   (if (provider-util/metabase-provider? provider-and-model)
     (some? (llm.settings/llm-proxy-base-url))
     (some-> provider-and-model
             provider-util/provider-and-model->provider
             configured-provider-credentials))))

(defsetting llm-metabot-configured?
  "Whether credentials for the selected Metabot provider are configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(llm-provider-configured? (llm-metabot-provider))
  :doc        false)

;;; ------------------------------------------------- AI Data Retention ------------------------------------------------

(def ^:private min-retention-days
  "Minimum allowed value for `ai-usage-max-retention-days`."
  30)

(def ^:private default-retention-days
  "Default value for `ai-usage-max-retention-days` (~6 months)."
  180)

(defn- log-minimum-value-warning
  [env-var-value]
  (log/warnf "MB_AI_USAGE_MAX_RETENTION_DAYS is set to %d; using the minimum value of %d instead."
             env-var-value
             min-retention-days))

(defn- -ai-usage-max-retention-days []
  (let [env-var-value (setting/get-value-of-type :integer :ai-usage-max-retention-days)]
    (cond
      (nil? env-var-value)
      default-retention-days

      ;; Treat 0 as an alias for infinite retention
      (zero? env-var-value)
      nil

      (< env-var-value min-retention-days)
      (do
        (log-minimum-value-warning env-var-value)
        min-retention-days)

      :else
      env-var-value)))

(defsetting ai-usage-max-retention-days
  (deferred-tru "Number of days to retain rows in the ai_usage_log, metabot_conversation, and metabot_message tables. Minimum value is 30; set to 0 to retain data indefinitely.")
  :type       :integer
  :visibility :admin
  :setter     :none
  :audit      :never
  :export?    true
  :encryption :no
  :getter     #'-ai-usage-max-retention-days
  :doc "Sets the maximum number of days Metabase preserves rows for the following application database tables:

- `ai_usage_log`
- `metabot_conversation`
- `metabot_message`

Once a day, Metabase deletes rows older than this threshold. The minimum value is 30 days (Metabase will treat entered values of 1 to 29 the same as 30).
If set to 0, Metabase will keep all rows.")
