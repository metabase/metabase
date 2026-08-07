(ns metabase.llm.settings
  "Settings for LLM integration (provider credentials, model defaults, provider configuration)."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]])
  (:import
   (java.net MalformedURLException URL)
   (software.amazon.awssdk.regions Region)))

(set! *warn-on-reflection* true)

(def known-aws-regions
  "The set of AWS region ids known to the bundled AWS SDK, e.g. `\"us-east-1\"`.
  Used to validate [[llm-bedrock-region]]."
  (into #{} (map str) (Region/regions)))

(def ^:private loopback-hosts
  "Hostnames that resolve to the local machine. `URL.getHost` returns IPv6 hosts
  wrapped in brackets, e.g. `[::1]`."
  #{"localhost" "127.0.0.1" "[::1]" "::1"})

(defn assert-llm-host-allowed!
  "Safeguard for Cypress e2e tests: refuse to send an LLM request to any host
  other than localhost. e2e tests are expected to point the LLM URL at a local
  mock server (see `startMockLlmServer`), so throwing here keeps a misconfigured
  test run from sending traffic to a real provider. No-op outside of e2e mode and
  for blank URLs (so the normal not-configured handling still runs)."
  [url]
  (when (and config/is-e2e? (not (str/blank? url)))
    (let [host (try
                 (u/lower-case-en (.getHost (URL. ^String url)))
                 ;; A malformed URL can't be verified as localhost — treat it as
                 ;; not allowed (fail closed) rather than throwing raw.
                 (catch MalformedURLException _ nil))]
      (when-not (and host (contains? loopback-hosts host))
        (throw (ex-info (tru "Refusing to send an LLM request to non-localhost host ''{0}'' during e2e tests. Point the LLM base URL at a local mock server." (or host url))
                        {:status-code 400
                         :llm-url     url}))))))

;;; ------------------------------------------------- Anthropic -------------------------------------------------

(defsetting llm-anthropic-api-key
  (deferred-tru "The Anthropic API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-anthropic-api-key
  :setter           :none
  :doc              "Sets up the Anthropic provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

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
  :export? false)

(defsetting llm-anthropic-api-base-url
  (deferred-tru "The Anthropic API base URL.")
  :encryption       :no
  :visibility       :settings-manager
  :default          "https://api.anthropic.com"
  :export?          false
  :setter           :none
  :deprecated-name  :ee-anthropic-api-base-url
  :doc              "The Anthropic API base URL used by the connection configured from the environment.")

(defsetting llm-anthropic-api-version
  (deferred-tru "The Anthropic API version.")
  :encryption :no
  :visibility :internal
  :default "2023-06-01"
  :export? false
  :doc false)

;;; -------------------------------------------------- OpenAI ---------------------------------------------------

(defsetting llm-openai-model
  (deferred-tru "The OpenAI Model (e.g. ''gpt-5.5'', ''gpt-5.4-mini'')")
  :encryption       :no
  :visibility       :settings-manager
  :default          "gpt-5.4"
  :export?          false
  :deprecated-name  :ee-openai-model)

(defsetting llm-openai-api-base-url
  (deferred-tru "The OpenAI API base URL.")
  :encryption       :no
  :visibility       :settings-manager
  :default          "https://api.openai.com"
  :export?          false
  :setter           :none
  :deprecated-name  :ee-openai-api-base-url
  :doc              "The OpenAI API base URL used by the connection configured from the environment.")

(defsetting llm-openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-openai-api-key
  :setter           :none
  :doc              "Sets up the OpenAI provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

;;; ------------------------------------------------- OpenRouter ------------------------------------------------

(defsetting llm-openrouter-api-base-url
  (deferred-tru "The OpenRouter API base URL used for Chat Completions.")
  :encryption       :no
  :visibility       :settings-manager
  :default          "https://openrouter.ai/api"
  :export?          false
  :setter           :none
  :deprecated-name  :ee-openrouter-api-base-url
  :doc              "The OpenRouter API base URL used by the connection configured from the environment.")

(defsetting llm-openrouter-api-key
  (deferred-tru "The OpenRouter API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-openrouter-api-key
  :setter           :none
  :doc              "Sets up the OpenRouter provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

;;; --------------------------------------------------- Z.AI ----------------------------------------------------

(defsetting llm-zai-api-base-url
  (deferred-tru "The Z.AI API base URL used for Chat Completions.")
  :encryption :no
  :visibility :settings-manager
  :default    "https://api.z.ai/api/paas/v4"
  :export?    false
  :setter     :none
  :doc        "The Z.AI API base URL used by the connection configured from the environment.")

(defsetting llm-zai-api-key
  (deferred-tru "The Z.AI API Key.")
  ;; Z.AI keys are `{id}.{secret}` pairs with no documented prefix, so unlike the other
  ;; direct-provider keys there is no format validation.
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :setter     :none
  :doc        "Sets up the Z.AI provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

;;; -------------------------------------------------- Mistral ---------------------------------------------------

(defsetting llm-mistral-api-base-url
  (deferred-tru "The Mistral API base URL used for Chat Completions.")
  :encryption :no
  :visibility :settings-manager
  :default    "https://api.mistral.ai/v1"
  :export?    false
  :setter     :none
  :doc        "The Mistral API base URL used by the connection configured from the environment.")

(defsetting llm-mistral-api-key
  (deferred-tru "The Mistral API Key.")
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :setter     :none
  :doc        "Sets up the Mistral provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

;;; ------------------------------------------------- Moonshot --------------------------------------------------

(defsetting llm-moonshot-api-base-url
  (deferred-tru "The Moonshot AI API base URL used for Chat Completions. Repoint this to use the `.cn` platform; keys are not interchangeable between the two.")
  :encryption :no
  :visibility :settings-manager
  :default    "https://api.moonshot.ai/v1"
  :export?    false
  :setter     :none
  :doc        "The Moonshot AI API base URL used by the connection configured from the environment.")

(defsetting llm-moonshot-api-key
  (deferred-tru "The Moonshot AI API Key.")
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :setter     :none
  :doc        "Sets up the Moonshot AI provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

;;; ------------------------------------ Google Gemini Enterprise Agent Platform --------------------------------
;;; The Gemini Enterprise Agent Platform (formerly Vertex AI). Every request applies to one Google Cloud project. The
;;; project ID is necessary. The location is optional and defaults to `global`.

(defsetting llm-google-service-account-key
  (deferred-tru "A Google Cloud service account key JSON for the Gemini Enterprise Agent Platform. Takes precedence over the OAuth access token when both are set.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "Sets up the Gemini Enterprise Agent Platform provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

(defsetting llm-google-oauth-access-token
  (deferred-tru "A short-lived OAuth2 access token for the Gemini Enterprise Agent Platform (e.g. from `gcloud auth print-access-token`). Useful for testing.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "The OAuth2 access token used by the Gemini Enterprise Agent Platform connection configured from the environment, when it carries no service account key.")

(def ^:private google-project-id-pattern
  "Matches a Google Cloud project ID: 6 to 30 characters of lowercase letters, digits and hyphens, starting with a
  letter and not ending with a hyphen.
  https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects"
  #"[a-z][a-z0-9-]{4,28}[a-z0-9]")

(defn valid-google-project-id?
  "True if `project-id` looks like a valid google project id."
  [project-id]
  (boolean (and (string? project-id)
                (re-matches google-project-id-pattern project-id))))

(def ^:private google-location-pattern
  "Matches a Google Cloud location ID, e.g. `us-central1`: hyphen-separated segments of lowercase letters and digits,
  the first of which starts with a letter."
  #"[a-z][a-z0-9]*(?:-[a-z0-9]+)*")

(def ^:private google-location-max-length
  "The longest location that still leaves a legal DNS label in `{location}-aiplatform.googleapis.com`.
  A label holds 63 characters and the `-aiplatform` suffix takes 11 of them."
  52)

(defn valid-google-location?
  "True if `location` can be spliced into a Gemini Enterprise Agent Platform request host.
  A location becomes a DNS label of that host, so a value that is not one cannot be sent.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations"
  [location]
  (boolean (and (<= (count location) google-location-max-length)
                (re-matches google-location-pattern location))))

(defsetting llm-google-project-id
  (deferred-tru "The Google Cloud project ID for the Gemini Enterprise Agent Platform.")
  :encryption  :no
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "The Google Cloud project used by the Gemini Enterprise Agent Platform connection configured from the environment.")

(defsetting llm-google-location
  (deferred-tru "The Google Cloud location for the Gemini Enterprise Agent Platform (e.g. us-central1). Defaults to global.")
  :encryption  :no
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "The Google Cloud location used by the Gemini Enterprise Agent Platform connection configured from the environment.")

(def google-global-api-base-url
  "Google's global Gemini Enterprise Agent Platform host, and the default for [[llm-google-api-base-url]].
  It serves only the `global` location. A regional location uses `https://{location}-aiplatform.googleapis.com`, and
  the `us` and `eu` multi-region locations use `https://aiplatform.{location}.rep.googleapis.com`."
  "https://aiplatform.googleapis.com")

(defsetting llm-google-api-base-url
  (deferred-tru "The Gemini Enterprise Agent Platform API base URL. Leave unset to derive it from the location.")
  :encryption  :no
  :visibility  :settings-manager
  :default     google-global-api-base-url
  :export?     false
  :setter      :none
  :doc         "The Gemini Enterprise Agent Platform API base URL used by the connection configured from the environment.")

;;; ----------------------------------------------- Amazon Bedrock ----------------------------------------------

(defsetting llm-bedrock-access-key-id
  (deferred-tru "The AWS Access Key ID for Amazon Bedrock.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "Sets up the Amazon Bedrock provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

(defsetting llm-bedrock-secret-access-key
  (deferred-tru "The AWS Secret Access Key for Amazon Bedrock.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "The AWS secret access key used by the Amazon Bedrock connection configured from the environment.")

(defsetting llm-bedrock-session-token
  (deferred-tru "The AWS Session Token for Amazon Bedrock. Only needed for temporary credentials.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "The AWS session token used by the Amazon Bedrock connection configured from the environment. Only needed for temporary credentials.")

(defsetting llm-bedrock-region
  (deferred-tru "The AWS region for Amazon Bedrock (e.g. us-east-1).")
  :encryption  :no
  :visibility  :settings-manager
  :default     "us-east-1"
  :export?     false
  :setter      :none
  :doc         "The AWS region used by the Amazon Bedrock connection configured from the environment.")

;;; ----------------------------------------------- Microsoft Azure ---------------------------------------------

(defsetting llm-azure-api-key
  (deferred-tru "The API key for the Azure resource hosting your models.")
  ;; Azure data-plane keys are unprefixed, so unlike the direct-provider keys there is no format validation.
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "Sets up the Azure provider connection from the environment. A connection configured this way is read-only in the UI and takes precedence over a stored connection with the same key; connections are otherwise managed on the admin AI settings page.")

(defsetting llm-azure-api-base-url
  (deferred-tru "The base URL of the Azure resource''s OpenAI- or Anthropic-compatible surface, e.g. `https://<resource>.services.ai.azure.com/openai`.")
  :encryption  :no
  :visibility  :settings-manager
  :export?     false
  :setter      :none
  :doc         "The Azure API base URL used by the connection configured from the environment.")

(defsetting llm-azure-model-family
  (deferred-tru "Whether the Azure deployment configured from the environment serves an `openai` or an `anthropic` model. Defaults to `openai`.")
  :encryption :no
  :visibility :settings-manager
  :export?    false
  :setter     :none
  :doc        "The wire protocol the Azure deployment speaks, `openai` or `anthropic`. Only read when the Azure connection is configured from the environment.")

(defsetting llm-azure-deployment-name
  (deferred-tru "The name of the model deployment served by the Azure connection configured from the environment.")
  :encryption :no
  :visibility :settings-manager
  :export?    false
  :setter     :none
  :doc        "The deployment the Azure connection configured from the environment serves. Azure's listing endpoint returns the regional catalog rather than your deployments, so there is nothing to discover and the deployment has to be named. Optional: an instance that already names its deployment in `MB_LLM_METABOT_PROVIDER` (`azure/<family>/<deployment>`) keeps working without it, but setting it is what lets the deployment be picked from the model dropdown.")

;;; ---------------------------------------------- Provider connections ------------------------------------------

;;; The per-provider credential settings above are read-only at runtime: they configure a connection only when set
;;; by an environment variable, which [[metabase.llm.provider/connections]] resolves on every read. Editing one in
;;; the app DB would not reach the connection serving requests, so a write is rejected rather than silently ignored.
;;; Connections are managed through the `/api/llm/providers` endpoints instead.

(defsetting llm-providers
  (deferred-tru "JSON array of configured LLM provider connections. Each entry has a `key` (a URL-safe slug identifying the connection), a `type` (the provider type, e.g. `anthropic`), a display `name`, and a `config` map of that provider type''s credential fields.")
  :type       :json
  :default    []
  :encryption :when-encryption-key-set
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :audit      :no-value
  :doc        "Connections are normally managed from the admin AI settings page. Setting this environment variable puts the whole list under environment control and makes it read-only in the UI.

Configuring a provider through the single-provider variables (`MB_LLM_ANTHROPIC_API_KEY` and friends) is equally supported, and is the simpler option when you only need one connection per provider and would rather not hand-write JSON. Each such provider becomes a read-only connection whose key is the provider type, resolved from the environment on every read, so editing one of those variables is picked up on the next restart. A provider configured this way takes precedence over a stored connection with the same key.")

;;; --------------------------------------------------- Proxy ---------------------------------------------------

(defsetting llm-proxy-base-url
  (deferred-tru "Base URL for the LLM proxy. When set, requests to the managed Metabase AI service are routed through this proxy and authenticated with the instance token instead of a provider API key. Harbormaster adds /llm component into the url.")
  ;; For details on llm component see the https://github.com/metabase/metabase/pull/74526#discussion_r3282553435.
  :enabled?         #(or (premium-features/has-feature? :metabase-ai-managed)
                         (premium-features/has-feature? :offer-metabase-ai-managed)
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
  :export? false)

(defsetting llm-request-timeout-ms
  (deferred-tru
   (str "Socket (inter-byte read) timeout in milliseconds for LLM API requests. "
        "For streaming responses this bounds the gap between successive chunks, "
        "NOT the total response time. Picked generously: extended thinking can "
        "pause for tens of seconds between chunks. Without it, a hung read inside "
        "the stream blocks the worker indefinitely — observed in production when "
        "an upstream proxy held the connection open without sending data."))
  :type :integer
  :default 120000
  :visibility :settings-manager
  :export? false)

(defsetting llm-connection-timeout-ms
  (deferred-tru
   (str "TCP connection timeout in milliseconds for LLM API requests. A provider "
        "that is down or unreachable should fail fast instead of holding a worker "
        "thread forever."))
  :type :integer
  :default 10000
  :visibility :settings-manager
  :export? false)

(defsetting llm-rate-limit-per-user
  (deferred-tru "Maximum SQL generation requests per user per minute.")
  :type :integer
  :default 20
  :visibility :settings-manager
  :export? false)

(defsetting llm-rate-limit-per-ip
  (deferred-tru "Maximum SQL generation requests per IP address per minute.")
  :type :integer
  :default 100
  :visibility :settings-manager
  :export? false)
