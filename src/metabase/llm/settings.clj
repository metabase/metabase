(ns metabase.llm.settings
  "Settings for LLM integration (provider credentials, model defaults, provider configuration)."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]])
  (:import
   (software.amazon.awssdk.regions Region)))

(set! *warn-on-reflection* true)

(def known-aws-regions
  "The set of AWS region ids known to the bundled AWS SDK, e.g. `\"us-east-1\"`.
  Used to validate [[llm-bedrock-region]]."
  (into #{} (map str) (Region/regions)))

(defn- trimmed-string
  [value]
  (when (string? value)
    (not-empty (str/trim value))))

(defn- set-trimmed-string!
  "Set a string setting to the trimmed `new-value`; blank values are stored as nil."
  [setting-key new-value]
  (setting/set-value-of-type! :string setting-key (trimmed-string new-value)))

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
                             (deferred-tru "Invalid Anthropic API key format. Key must start with ''sk-ant-''.")))

(defsetting llm-anthropic-api-key-configured?
  "Whether an Anthropic API key has been configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(some? (llm-anthropic-api-key))
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

;;; ----------------------------------------------- Amazon Bedrock ----------------------------------------------

(defsetting llm-bedrock-access-key-id
  (deferred-tru "The AWS Access Key ID for Amazon Bedrock.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :doc         false
  :setter      (partial set-trimmed-string! :llm-bedrock-access-key-id))

(defsetting llm-bedrock-secret-access-key
  (deferred-tru "The AWS Secret Access Key for Amazon Bedrock.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :doc         false
  :setter      (partial set-trimmed-string! :llm-bedrock-secret-access-key))

(defsetting llm-bedrock-session-token
  (deferred-tru "The AWS Session Token for Amazon Bedrock. Only needed for temporary credentials.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :doc         false
  :setter      (partial set-trimmed-string! :llm-bedrock-session-token))

(defn- set-bedrock-region!
  [new-value]
  (let [region (trimmed-string new-value)]
    (when (and region (not (contains? known-aws-regions region)))
      (throw (ex-info (tru "Invalid AWS region {0}." (pr-str region)) {:status-code 400})))
    (setting/set-value-of-type! :string :llm-bedrock-region region)))

(defsetting llm-bedrock-region
  (deferred-tru "The AWS region for Amazon Bedrock (e.g. us-east-1).")
  :encryption  :no
  :visibility  :settings-manager
  :default     "us-east-1"
  :export?     false
  :doc         false
  :setter      set-bedrock-region!)

(defsetting llm-bedrock-configured?
  "Whether the required AWS Bedrock credentials are configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(boolean (and (trimmed-string (llm-bedrock-access-key-id))
                             (trimmed-string (llm-bedrock-secret-access-key))))
  :doc        false)

;;; ----------------------------------------------- Microsoft Azure ---------------------------------------------

(defsetting llm-azure-api-key
  (deferred-tru "The API key for the Azure resource hosting your models.")
  ;; Azure data-plane keys are unprefixed, so unlike the direct-provider keys there is no format validation.
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :doc         false
  :setter      (partial set-trimmed-string! :llm-azure-api-key))

(defn normalize-llm-base-url
  "Trim whitespace and trailing slashes from an admin-entered LLM base URL; blank values become nil.
  The URL is otherwise persisted exactly as entered — admin-entered URLs are not silently rewritten."
  [value]
  (some-> (trimmed-string value)
          (str/replace #"/+$" "")
          not-empty))

(defsetting llm-azure-api-base-url
  (deferred-tru "The base URL of the Azure resource''s OpenAI- or Anthropic-compatible surface, e.g. https://<resource>.services.ai.azure.com/openai.")
  :encryption  :no
  :visibility  :settings-manager
  :export?     false
  :doc         false
  :setter      (fn [new-value]
                 (setting/set-value-of-type! :string :llm-azure-api-base-url (normalize-llm-base-url new-value))))

;;; --------------------------------------------------- Proxy ---------------------------------------------------

(defsetting llm-proxy-base-url
  (deferred-tru "Base URL for the LLM proxy. When set, requests to the managed Metabase AI service are routed through this proxy and authenticated with the instance token instead of a provider API key. Harbormaster adds /llm component into the url.")
  ;; For details on llm component see the https://github.com/metabase/metabase/pull/74526#discussion_r3282553435.
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
  :getter           #(some? (llm-proxy-base-url))
  :doc              false)

;;; -------------------------------------------------- General --------------------------------------------------

(defsetting ai-features-enabled?
  (deferred-tru "Whether AI features are enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true)

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
