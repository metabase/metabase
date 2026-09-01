(ns metabase.llm.provider
  "LLM provider types and provider connections.

  A *provider type* describes a kind of LLM connection: its label, the credential fields it needs, and its default
  model. The registry below is pure data, so adding a provider type does not mean editing a `case` in every
  namespace that touches credentials, and the admin UI can render a connection form without knowing the type.

  A *connection* is one configured instance of a provider type. Connections live in the [[llm-providers]] setting as
  a list of maps, so an instance can hold several connections of the same type with different credentials:

    {:key \"anthropic-eval\" :type \"anthropic\" :name \"Anthropic (evals)\" :config {:api-key \"sk-ant-...\"}}

  `:key` is a URL-safe slug that identifies the connection. It is what the first segment of a
  `llm-metabot-provider` string refers to, and it defaults to the provider type, so a single-connection instance
  reads exactly as it did when there was one connection per type.

  A *model reference* is the `connection-key/model` string stored in `llm-metabot-provider` and friends;
  [[resolve-model-ref]] turns one into the provider type, model, and credentials an adapter needs."
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Provider types ------------------------------------------------

(defn- strip-trailing-slashes
  "Trim whitespace and trailing slashes from an admin-entered base URL, so joining it with a `/path` cannot produce
  a double slash. The URL is otherwise passed through as entered."
  [value]
  (str/replace (str/trim value) #"/+$" ""))

(def ^:private aws-region-options
  (mapv (fn [region] {:value region :label region})
        (sort llm.settings/known-aws-regions)))

(def ^:private provider-type-registry
  "Every provider type Metabase can connect to, in the order the admin UI offers them.

  `:fields` describes the credential inputs for a connection's `:config` map. A `:password` field is treated as
  secret everywhere: it is masked on the way out of the API and preserved when a client echoes the mask back."
  [{:type          "anthropic"
    :label         (deferred-tru "Anthropic")
    :default-model "claude-sonnet-4-6"
    :mini-model    "claude-haiku-4-5-20251001"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-ant-api03-..."
                     :prefix      "sk-ant-"
                     :docs-url    "https://console.anthropic.com/settings/keys"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.anthropic.com"}]}
   {:type          "openai"
    :label         (deferred-tru "OpenAI")
    :default-model "gpt-5.4"
    :mini-model    "gpt-5.4-mini"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-proj-..."
                     :prefix      "sk-"
                     :docs-url    "https://platform.openai.com/api-keys"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.openai.com"}]}
   {:type          "openrouter"
    :label         (deferred-tru "OpenRouter")
    :default-model "anthropic/claude-sonnet-4.6"
    :mini-model    "anthropic/claude-haiku-4.5"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-or-v1-..."
                     :prefix      "sk-or-v1-"
                     :docs-url    "https://openrouter.ai/keys"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://openrouter.ai/api"}]}
   {:type          "mistral"
    :label         (deferred-tru "Mistral")
    :default-model "mistral-medium-3-5"
    :mini-model    "mistral-medium-3-5"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     ;; Mistral keys have no recognizable prefix.
                     :placeholder (deferred-tru "Enter your Mistral API key")
                     :docs-url    "https://console.mistral.ai/api-keys"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.mistral.ai/v1"}]}
   {:type          "zai"
    :label         (deferred-tru "Z.AI")
    :default-model "glm-5.2"
    :mini-model    "glm-5.2"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     ;; Z.AI keys are `{id}.{secret}` pairs with no documented prefix.
                     :placeholder (deferred-tru "Enter your Z.AI API key")
                     :docs-url    "https://z.ai/manage-apikey/apikey-list"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.z.ai/api/paas/v4"}]}
   {:type          "moonshot"
    :label         (deferred-tru "Moonshot AI")
    :default-model "kimi-k3"
    :mini-model    "kimi-k3"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-..."
                     :docs-url    "https://platform.kimi.ai/console/api-keys"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.moonshot.ai/v1"
                     :help      (deferred-tru "Point this at the .cn platform to use it instead; keys are not interchangeable between the two.")}]}
   {:type          "deepseek"
    :label         (deferred-tru "DeepSeek")
    :default-model "deepseek-v4-pro"
    :mini-model    "deepseek-v4-flash"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     ;; No `:prefix`: DeepSeek keys carry the same `sk-` an OpenAI key does, so matching on it
                     ;; would claim OpenAI keys while rejecting nothing.
                     :required?   true
                     :placeholder "sk-..."
                     :docs-url    "https://platform.deepseek.com/api_keys"}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.deepseek.com"
                     :help      (deferred-tru "The root both surfaces hang off; leave off any /anthropic or /v1 path.")}]}
   {:type          "google"
    ;; "Google Gemini Enterprise" (nearly the official "Gemini Enterprise Agent Platform" name), not "Google
    ;; Gemini": the Gemini API is a separate surface with its own credentials, and may become a provider type of
    ;; its own one day.
    :label         (deferred-tru "Google Gemini Enterprise")
    :default-model "google/gemini-3.5-flash"
    ;; The Gemini Enterprise Agent Platform has no listing endpoint we can trust — the one it exposes reports models
    ;; that are not really available and omits ones that are — so the models Metabot is known to work with are fixed
    ;; here, and connecting validates the credentials against the model chosen in the connection form with a probe.
    ;; Which of them a project can actually reach depends on its location.
    :models        [{:id "google/gemini-3.5-flash"             :display_name "Gemini 3.5 Flash"}
                    {:id "google/gemini-3.6-flash"             :display_name "Gemini 3.6 Flash"}
                    {:id "google/gemini-3.7-flash"             :display_name "Gemini 3.7 Flash"}
                    {:id "anthropic/claude-fable-5"            :display_name "Claude Fable 5"}
                    {:id "anthropic/claude-opus-5"             :display_name "Claude Opus 5"}
                    {:id "anthropic/claude-opus-4-6"           :display_name "Claude Opus 4.6"}
                    {:id "anthropic/claude-sonnet-5"           :display_name "Claude Sonnet 5"}
                    {:id "anthropic/claude-sonnet-4-6"         :display_name "Claude Sonnet 4.6"}
                    {:id "anthropic/claude-haiku-4-5@20251001" :display_name "Claude Haiku 4.5"}]
    ;; A service account key authenticates on its own (it can carry the project); an OAuth token needs the project
    ;; named beside it.
    :required-any  [[:service-account-key] [:oauth-access-token :project-id]]
    :fields        [{:key         :project-id
                     :label       (deferred-tru "Project ID")
                     :type        :text
                     :placeholder (deferred-tru "my-project")
                     :validate    (fn [value]
                                    (when-not (llm.settings/valid-google-project-id? value)
                                      (tru "\"{0}\" is not a valid Google Cloud project ID. Use the project ID — 6 to 30 lowercase letters, digits and hyphens — rather than the project name or number." value)))
                     :help        (deferred-tru "The Google Cloud project to use. Optional if the service account key provides it.")
                     :docs-url    "https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects"}
                    {:key       :location
                     :label     (deferred-tru "Location")
                     :type      :text
                     :placeholder "global"
                     :validate  (fn [value]
                                  (when-not (llm.settings/valid-google-location? value)
                                    (tru "\"{0}\" is not a valid Google Cloud location." value)))
                     :help      (deferred-tru "Optional. Defaults to global.")}
                    {:key       :auth-method
                     :label     (deferred-tru "Authentication method")
                     :type      :segmented
                     :required? true
                     :options   [{:value "service-account-key" :label (deferred-tru "Service account key")}
                                 {:value "oauth-token" :label (deferred-tru "OAuth token")}]
                     :default   "service-account-key"
                     :help      (deferred-tru "Authenticate with a service account key or an OAuth access token.")}
                    {:key         :service-account-key
                     :label       (deferred-tru "Service account key file")
                     :type        :file
                     ;; the file is the whole credential — private key included — so it is redacted like a password
                     :sensitive?  true
                     :show-when   {:field :auth-method :value "service-account-key"}
                     :placeholder (deferred-tru "Click to select a file")
                     :help        (deferred-tru "Upload a service account key file to authenticate with.")
                     :docs-url    "https://docs.cloud.google.com/iam/docs/keys-create-delete"}
                    {:key         :oauth-access-token
                     ;; not "OAuth token", which is what the method above is called: one label per control
                     :label       (deferred-tru "OAuth access token")
                     :type        :password
                     :show-when   {:field :auth-method :value "oauth-token"}
                     :placeholder "ya29..."
                     :help        (deferred-tru "A short-lived token, e.g. the output of gcloud auth print-access-token. Useful for testing.")}
                    {:key       :base-url
                     :normalize strip-trailing-slashes
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   llm.settings/google-global-api-base-url
                     :help      (deferred-tru "Derived from the location when left at the global host.")}]}
   {:type          "azure"
    :label         (deferred-tru "Microsoft Azure")
    :default-model nil
    ;; Azure serves deployments the customer names, and its listing endpoint returns the regional catalog rather
    ;; than those deployments, so there is nothing to fetch. The admin names the one this connection serves, and
    ;; picks the wire family separately rather than typing it as a prefix.
    :model-fields  [:model-family :deployment-name]
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder (deferred-tru "Enter your Azure API key")
                     :docs-url    "https://ai.azure.com"}
                    {:key         :base-url
                     :normalize   strip-trailing-slashes
                     :label       (deferred-tru "API base URL")
                     :type        :text
                     :required?   true
                     :placeholder "https://<resource>.services.ai.azure.com/openai"}
                    {:key       :model-family
                     :label     (deferred-tru "Model provider")
                     :type      :select
                     :required? true
                     :options   [{:value "openai" :label "OpenAI"}
                                 {:value "anthropic" :label "Anthropic"}]
                     :default   "openai"
                     :help      (deferred-tru "Whether your deployment serves an Anthropic or an OpenAI model.")}
                    {:key         :deployment-name
                     :label       (deferred-tru "Deployment name")
                     :type        :text
                     :required?   true
                     :placeholder (deferred-tru "Enter your Azure deployment name")
                     :help        (deferred-tru "The name of the model deployment on your Azure resource. We recommend naming deployments after the model they serve.")}]}
   {:type          "bedrock"
    :label         (deferred-tru "Amazon Bedrock")
    :default-model "anthropic.claude-opus-4-8"
    :mini-model    "anthropic.claude-haiku-4-5"
    :fields        [{:key         :access-key-id
                     :label       (deferred-tru "Access key ID")
                     :type        :password
                     :required?   true
                     :placeholder "AKIA..."
                     :docs-url    "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html"}
                    {:key       :secret-access-key
                     :label     (deferred-tru "Secret access key")
                     :type      :password
                     :required? true}
                    {:key     :region
                     :label   (deferred-tru "Region")
                     :type    :select
                     :options aws-region-options
                     :default "us-east-1"}
                    {:key       :session-token
                     :label     (deferred-tru "Session token")
                     :type      :password
                     :advanced? true
                     :help      (deferred-tru "Only needed for temporary credentials.")}]}
   {:type          "vllm"
    :label         (deferred-tru "vLLM")
    ;; A vLLM server serves whatever the operator loaded it with, so there is no model to default to: the one a
    ;; new connection starts on comes from the catalog that connecting fetches (see
    ;; [[metabase.metabot.self.vllm/list-models]]).
    :default-model nil
    :fields        [{:key         :base-url
                     :normalize   strip-trailing-slashes
                     :label       (deferred-tru "API base URL")
                     :type        :text
                     :required?   true
                     :placeholder "http://vllm.internal:8000/v1"
                     :help        (deferred-tru "Your server''s OpenAI-compatible API. It should end in /v1.")}
                    {:key      :api-key
                     :label    (deferred-tru "API key")
                     :type     :password
                     ;; not required: a server started without --api-key takes no key, and a base URL on its own
                     ;; is a complete configuration
                     :help     (deferred-tru "Only needed if you started your server with --api-key.")}]}
   {:type          "metabase"
    :label         (deferred-tru "Metabase AI service")
    :managed?      true
    :singleton?    true
    :default-model "anthropic/claude-sonnet-4-6"
    ;; The proxy serves one benchmarked model rather than a listable catalog, so the models are fixed here instead
    ;; of fetched. This is also the allow-list `llm-metabot-provider` is validated against.
    :models        [{:id "anthropic/claude-sonnet-4-6" :display_name "Claude Sonnet 4.6"}]
    :fields        []}])

(def ^:private provider-type-by-name
  (into {} (map (juxt :type identity)) provider-type-registry))

(defn provider-type
  "The registry entry for `type-name`, or nil when it is not a known provider type."
  [type-name]
  (get provider-type-by-name type-name))

(defn provider-types
  "Every registered provider type."
  []
  provider-type-registry)

(defn managed-type?
  "Whether `type-name` is the Metabase-managed provider, which authenticates with the instance token through the LLM
  proxy instead of with credentials of its own."
  [type-name]
  (boolean (:managed? (provider-type type-name))))

(defn type-available?
  "Whether a connection of this type can currently be created. The managed provider needs the LLM proxy configured;
  everything else is always available."
  [type-name]
  (if (managed-type? type-name)
    (some? (llm.settings/llm-proxy-base-url))
    (some? (provider-type type-name))))

(defn secret-field-keys
  "The `:config` keys of `type-name` that hold secrets: every `:password` field, plus any field marked
  `:sensitive?` — named for the defsetting option it mirrors — regardless of its input type. Google's service
  account key is a file upload, but it is the whole credential."
  [type-name]
  (into #{}
        (comp (filter (fn [{:keys [type sensitive?]}] (or (= :password type) sensitive?)))
              (map :key))
        (:fields (provider-type type-name))))

(defn singleton-type?
  "Whether at most one connection of `type-name` can exist. True for the Metabase-managed provider, which is a
  property of the instance's subscription rather than a credential an admin can hold several of."
  [type-name]
  (boolean (:singleton? (provider-type type-name))))

(defn fixed-models
  "The models `type-name` serves, for types whose catalog is fixed rather than fetched from the provider. Returns nil
  for types whose models are listed over the wire."
  [type-name]
  (:models (provider-type type-name)))

(defn model-fields
  "The `:config` keys whose values compose the model a connection of `type-name` serves, for types whose models
  cannot be listed from the provider. Returns nil for types whose catalog is fetched or fixed."
  [type-name]
  (:model-fields (provider-type type-name)))

(defn default-model
  "The model a new connection of `type-name` starts on, or nil when the type has no sensible default (Azure, whose
  models are deployment names the admin chooses)."
  [type-name]
  (:default-model (provider-type type-name)))

(defn mini-model
  "The fastest and cheapest model `type-name` serves — what short utility calls such as conversation titles run on
  when no model has been picked for them. Returns nil for the types that have no cheaper tier to fall back to: the
  ones whose connection names the single model it serves rather than picking from a catalog, and the managed
  provider, which serves one benchmarked model."
  [type-name]
  (:mini-model (provider-type type-name)))

;;; -------------------------------------------------- Validation --------------------------------------------------

(defn connection-model
  "The model `config` names, composed from its type's [[model-fields]] — Azure's `{family}/{deployment}` comes from
  two inputs so the admin picks the family rather than typing it as a prefix. Returns nil for types that list their
  models, and for a connection that has not filled every part in yet."
  [type-name config]
  (when-let [field-keys (seq (model-fields type-name))]
    (let [parts (map #(u/trimmed-string (get config %)) field-keys)]
      (when (every? some? parts)
        (str/join "/" parts)))))

(defn- validate-field!
  [type-name {:keys [key label required? prefix default options validate]} config]
  (let [value (u/trimmed-string (get config key))]
    (when (and required? (not value) (not default))
      (throw (ex-info (tru "{0} is required for {1}." (str label) type-name)
                      {:status-code 400 :field key})))
    (when (and value prefix (not (str/starts-with? value prefix)))
      (throw (ex-info (tru "Invalid {0} for {1}. It must start with ''{2}''." (str label) type-name prefix)
                      {:status-code 400 :field key})))
    (when (and value (seq options) (not-any? #(= value (:value %)) options))
      (throw (ex-info (tru "Invalid {0} for {1}." (str label) type-name)
                      {:status-code 400 :field key})))
    (when-let [problem (and value validate (validate value))]
      (throw (ex-info (str problem) {:status-code 400 :field key})))))

(defn- validate-config-field!
  "Run [[validate-field!]]'s checks for the single field `field-key` of `type-name` against `config`."
  [type-name field-key config]
  (when-let [field (u/find-first-map (:fields (provider-type type-name)) [:key] field-key)]
    (validate-field! type-name field config)))

(defn- validate-required-any!
  "Throw a 400 unless `config` satisfies one of `type-name`'s `:required-any` credential groups — for Google, a
  service account key on its own or an OAuth token together with a project ID."
  [type-name config]
  (let [{:keys [required-any fields]} (provider-type type-name)
        label-for                     (into {} (map (juxt :key :label)) fields)
        carried?                      (fn [group] (every? #(u/trimmed-string (get config %)) group))]
    (when (and (seq required-any) (not-any? carried? required-any))
      (throw (ex-info (tru "{0} needs one of: {1}."
                           type-name
                           (str/join (str " " (tru "or") " ")
                                     (map (fn [group] (str/join " + " (map (comp str label-for) group)))
                                          required-any)))
                      {:status-code 400 :required-any required-any})))))

(defn validate-config!
  "Check a connection's `:config` against its provider type's field descriptors: required fields are present, fields
  that declare a `:prefix` start with it, `:options` values are among the options, per-field `:validate` hooks pass,
  and one of the type's `:required-any` credential groups is carried. Throws a 400 on the first problem."
  [type-name config]
  (when-not (provider-type type-name)
    (throw (ex-info (tru "Unknown provider type {0}." (pr-str type-name))
                    {:status-code 400 :type type-name})))
  (doseq [field (:fields (provider-type type-name))]
    (validate-field! type-name field config))
  (validate-required-any! type-name config))

(defn credentials-complete?
  "Whether `config` carries the credentials a request needs.

  A required field the registry gives a `:default` counts as carried: [[with-field-defaults]] supplies it when the
  connection is resolved, so leaving it untouched is the admin accepting the value its form showed. A type with
  `:required-any` groups additionally needs one of them carried in full — Google's fields are individually optional
  because either credential will do, which without the groups would make an empty config count as complete.

  [[model-fields]] are exempt: they name what to call, not what authenticates the call, and a connection can
  legitimately take its model from the `connection-key/model` reference instead — which is where an Azure
  deployment configured before the connection list existed still lives. [[validate-config!]] still requires them
  of anything saved through the API, so only the environment and a hand-written `llm-providers` can omit them."
  [type-name config]
  (let [{:keys [fields required-any]} (provider-type type-name)
        model-keys                    (set (model-fields type-name))]
    (and (every? (fn [{:keys [key required? default]}]
                   (or (not required?)
                       default
                       (contains? model-keys key)
                       (u/trimmed-string (get config key))))
                 fields)
         (or (empty? required-any)
             (boolean (some (fn [group] (every? #(u/trimmed-string (get config %)) group))
                            required-any))))))

(defn config-complete?
  "Whether a connection of `type-name` can make requests: [[credentials-complete?]], or for the Metabase-managed
  provider — which authenticates with the instance token rather than with credentials of its own — whether the LLM
  proxy is configured."
  [type-name config]
  (if (managed-type? type-name)
    (some? (llm.settings/llm-proxy-base-url))
    (credentials-complete? type-name config)))

;;; ---------------------------------------- Connections configured by env var ------------------------------------

(def managed-connection-key
  "The connection key reserved for the Metabase-managed provider. Requests for it are routed through the LLM proxy
  and authenticated with the instance token."
  "metabase")

(def ^:private single-provider-settings
  "The per-type credential settings, keyed by the connection they configure.

  Pointing one of these at an environment variable is a supported way to configure a provider: it sets up a single
  connection without writing JSON into [[llm-providers]]. `:settings` maps a `:config` key to the setting that
  supplies it; a connection is configured only when at least one of the settings marked `:credential?` is set by an
  env var."
  {"anthropic"  {:type     "anthropic"
                 :settings {:api-key  {:setting :llm-anthropic-api-key :credential? true}
                            :base-url {:setting :llm-anthropic-api-base-url}}}
   "openai"     {:type     "openai"
                 :settings {:api-key  {:setting :llm-openai-api-key :credential? true}
                            :base-url {:setting :llm-openai-api-base-url}}}
   "openrouter" {:type     "openrouter"
                 :settings {:api-key  {:setting :llm-openrouter-api-key :credential? true}
                            :base-url {:setting :llm-openrouter-api-base-url}}}
   "mistral"    {:type     "mistral"
                 :settings {:api-key  {:setting :llm-mistral-api-key :credential? true}
                            :base-url {:setting :llm-mistral-api-base-url}}}
   "zai"        {:type     "zai"
                 :settings {:api-key  {:setting :llm-zai-api-key :credential? true}
                            :base-url {:setting :llm-zai-api-base-url}}}
   "moonshot"   {:type     "moonshot"
                 :settings {:api-key  {:setting :llm-moonshot-api-key :credential? true}
                            :base-url {:setting :llm-moonshot-api-base-url}}}
   "deepseek"   {:type     "deepseek"
                 :settings {:api-key  {:setting :llm-deepseek-api-key :credential? true}
                            :base-url {:setting :llm-deepseek-api-base-url}}}
   "google"     {:type     "google"
                 :settings {:service-account-key {:setting :llm-google-service-account-key :credential? true}
                            :oauth-access-token  {:setting :llm-google-oauth-access-token :credential? true}
                            :project-id          {:setting :llm-google-project-id}
                            :location            {:setting :llm-google-location}
                            :base-url            {:setting :llm-google-api-base-url}}}
   "azure"      {:type     "azure"
                 ;; the base URL is not a credential: on its own it can shadow a stored connection's field, but it
                 ;; must not bring a standalone — and unusable — connection into existence
                 :settings {:api-key         {:setting :llm-azure-api-key :credential? true}
                            :base-url        {:setting :llm-azure-api-base-url}
                            :model-family    {:setting :llm-azure-model-family}
                            :deployment-name {:setting :llm-azure-deployment-name}}}
   "bedrock"    {:type     "bedrock"
                 :settings {:access-key-id     {:setting :llm-bedrock-access-key-id :credential? true}
                            :secret-access-key {:setting :llm-bedrock-secret-access-key :credential? true}
                            :session-token     {:setting :llm-bedrock-session-token}
                            :region            {:setting :llm-bedrock-region}}}
   "vllm"       {:type     "vllm"
                 ;; the base URL is the credential here, unlike Azure's: a server started without --api-key takes
                 ;; no key, so the URL alone brings a usable connection into existence
                 :settings {:base-url {:setting :llm-vllm-api-base-url :credential? true}
                            :api-key  {:setting :llm-vllm-api-key}}}})

(defn connection-env-vars
  "The environment variables that configure a connection of `type-name`, as `{config-field \"MB_LLM_...\"}`.

  Returns nil for a type no per-provider variable configures — the managed provider, which holds no credentials of
  its own, is the only one today. Setting these is the supported way to configure a single connection without writing
  JSON into [[metabase.llm.settings/llm-providers]]."
  [type-name]
  (when-let [{:keys [settings]} (get single-provider-settings type-name)]
    (not-empty
     (into {}
           (keep (fn [{field-key :key}]
                   (when-let [setting-kw (get-in settings [field-key :setting])]
                     [field-key (setting/env-var-name setting-kw)])))
           (:fields (provider-type type-name))))))

(defn- env-supplied-fields
  "The `:config` fields the environment supplies for one [[single-provider-settings]] group:
  `{:config {field value} :vars {field \"MB_...\"} :credential-set? bool}`."
  [{:keys [settings]}]
  (reduce-kv
   (fn [acc config-key {:keys [setting credential?]}]
     (if-some [value (u/trimmed-string (setting/env-var-value setting))]
       (cond-> (-> acc
                   (assoc-in [:config config-key] value)
                   (assoc-in [:vars config-key] (setting/env-var-name setting)))
         credential? (assoc :credential-set? true))
       acc))
   {:config {} :vars {}}
   settings))

(defn- env-overlays
  "The environment's contribution to each connection key, resolved on every read so editing a variable takes effect
  on the next restart without anything having to be migrated or re-saved."
  []
  (into {}
        (keep (fn [[conn-key spec]]
                (let [{:keys [config] :as supplied} (env-supplied-fields spec)]
                  (when (seq config)
                    [conn-key (assoc supplied :type (:type spec))]))))
        single-provider-settings))

(defn- env-managed-connection
  "The managed connection `MB_LLM_METABOT_PROVIDER` demands: a `metabase/...` reference pinned by the environment
  has to resolve even though the managed connection holds no credentials a variable could supply."
  []
  (when (some-> (setting/env-var-value :llm-metabot-provider)
                (str/starts-with? (str managed-connection-key "/")))
    {:key        managed-connection-key
     :type       managed-connection-key
     :name       (str (:label (provider-type managed-connection-key)))
     :source     :env
     :env-vars   (sorted-set (setting/env-var-name :llm-metabot-provider))
     :env-fields #{}
     :config     {}}))

;;; --------------------------------------------------- Connections -------------------------------------------------

(defn stored-connections
  "The connection list exactly as persisted in [[llm-providers]], without the environment layered over it.

  Writes edit *this* list rather than [[connections]]. A stored connection whose key an env var shadows is absent
  from [[connections]], so rebuilding the list from there would drop it from the setting the next time an admin
  saved anything — the credentials would be gone for good once the env var came back off."
  []
  (vec (llm.settings/llm-providers)))

(defn- annotated-stored-connections
  []
  (let [env-managed? (some? (setting/env-var-value :llm-providers))
        annotate     (fn [conn]
                       (cond-> (assoc conn :source (if env-managed? :env :db))
                         env-managed? (assoc :env-vars #{(setting/env-var-name :llm-providers)})))]
    (into [] (map annotate) (stored-connections))))

(defn connections
  "Every connection this instance can use, in admin-facing order.

  Connections stored in [[llm-providers]] come first, then any synthesized from the single-provider environment
  variables. On a key collision the environment shadows the stored connection *field by field*, the way an env var
  shadows any other setting: a lone `MB_LLM_ANTHROPIC_API_BASE_URL` reaches the stored connection's base URL
  instead of doing nothing, and everything the environment does not supply stays editable. `:env-fields` names the
  config keys the environment owns, and `:env-vars` the variables supplying them, so the form can disable exactly
  those inputs.

  A standalone `:env` connection is synthesized only when a variable marked `:credential?` is set — credentials are
  what bring a connection into existence; a base URL alone shadows but does not create. The managed connection is
  synthesized whenever `MB_LLM_METABOT_PROVIDER` pins a `metabase/...` reference, so that reference resolves."
  []
  (let [overlays   (env-overlays)
        overlaid   (mapv (fn [{conn-key :key :keys [type] :as conn}]
                           (let [{env-config :config vars :vars :as overlay} (get overlays conn-key)]
                             ;; only a same-typed overlay applies: the fields describe this provider type's config
                             (if (and overlay (= type (:type overlay)))
                               (-> conn
                                   (update :config merge env-config)
                                   (update :env-vars (fnil into (sorted-set)) (vals vars))
                                   (assoc :env-fields (set (keys env-config))))
                               conn)))
                         (annotated-stored-connections))
        taken      (into #{} (map :key) overlaid)
        standalone (into []
                         (keep (fn [[conn-key {:keys [type config vars credential-set?]}]]
                                 (when (and credential-set? (not (contains? taken conn-key)))
                                   {:key        conn-key
                                    :type       type
                                    :name       (str (:label (provider-type type)))
                                    :source     :env
                                    :env-vars   (into (sorted-set) (vals vars))
                                    :env-fields (set (keys config))
                                    :config     config})))
                         overlays)
        managed    (env-managed-connection)
        all        (into overlaid standalone)]
    (cond-> all
      (and managed (not-any? #(= (:key managed) (:key %)) all))
      (conj managed))))

(defn connection
  "The connection identified by `conn-key`, or nil."
  [conn-key]
  (u/find-first-map (connections) [:key] conn-key))

(defn credentials
  "The `:config` map to authenticate `conn-key`'s requests with, or nil when there is no such connection."
  [conn-key]
  (:config (connection conn-key)))

(defn connection-usable?
  "Whether `conn-key` names a connection with everything it needs to make requests."
  [conn-key]
  (boolean
   (when-let [{:keys [type config]} (connection conn-key)]
     (config-complete? type config))))

(defn set-connections!
  "Persist `conns` as the stored connection list, dropping the derived annotation keys."
  [conns]
  (llm.settings/llm-providers! (mapv #(dissoc % :source :env-vars :env-fields) conns)))

;;; --------------------------------------------------- Slugs ------------------------------------------------------

(defn- ->slug
  "Lowercase `s` and collapse anything that is not a letter or digit into single hyphens, so the result satisfies
  [[metabase.util/valid-slug?]]. Returns nil when nothing usable is left."
  [s]
  (-> (u/lower-case-en (str s))
      (str/replace #"[^a-z0-9]+" "-")
      (str/replace #"^-+|-+$" "")
      not-empty))

(defn unique-key
  "A URL-safe connection key derived from `desired`, suffixed until it does not collide with an existing connection.

  New connections default to their provider type, so the first Anthropic connection is `anthropic` and reads the
  same way the old single-provider setting did."
  [desired]
  (let [base (or (->slug desired) "provider")
        used (into #{} (map :key) (connections))]
    (if-not (contains? used base)
      base
      (first (remove #(contains? used %)
                     (map #(str base "-" %) (iterate inc 2)))))))

;;; ----------------------------------------------- Model references ------------------------------------------------

(defn managed-model-ref?
  "Whether `model-ref` names the Metabase-managed connection."
  [model-ref]
  (boolean (some-> model-ref (str/starts-with? (str managed-connection-key "/")))))

(defn model-ref->connection-key
  "The connection key of a `connection-key/model` string."
  [model-ref]
  (when model-ref
    (first (str/split model-ref #"/" 2))))

(defn model-ref->model
  "The model part of a `connection-key/model` string — everything after the first segment."
  [model-ref]
  (when model-ref
    (second (str/split model-ref #"/" 2))))

(defn strip-managed-prefix
  "Drop the `metabase/` routing prefix from a model reference, leaving the `provider/model` pair the proxy forwards.
  Returns `model-ref` unchanged when it has no such prefix."
  [model-ref]
  (if (managed-model-ref? model-ref)
    (str/replace-first model-ref (str managed-connection-key "/") "")
    model-ref))

(defn with-field-defaults
  "Fill in each field's registry `:default` wherever `config` left it blank, and run each field's `:normalize` over
  the value that results, so a resolved connection carries everything the adapter needs in the shape it needs it.
  Normalizing here rather than on write covers every source of a value — the stored config, an environment
  variable, and the default itself — so a base URL entered with a trailing slash cannot double up the `/` when a
  path is joined onto it."
  [type-name config]
  (reduce (fn [config {:keys [key default normalize]}]
            (let [config (cond-> config
                           (and default (not (u/trimmed-string (get config key))))
                           (assoc key default))]
              (cond-> config
                (and normalize (u/trimmed-string (get config key)))
                (update key normalize))))
          (or config {})
          (:fields (provider-type type-name))))

(defn resolve-model-ref
  "Resolve a `connection-key/model` string against the configured connections.

  Returns `{:connection-key :type :model :credentials :ai-proxy?}`, or nil when no such connection exists. `:type`
  is the provider type whose adapter should serve the request: for the managed connection that is the wire family
  named by the model's own first segment (`metabase/anthropic/claude-...` is served by the Anthropic adapter over
  the proxy), and `:model` is what remains."
  [model-ref]
  (let [conn-key (model-ref->connection-key model-ref)
        model    (model-ref->model model-ref)]
    (when-let [{:keys [type config]} (connection conn-key)]
      (if (managed-type? type)
        {:connection-key conn-key
         :type           (model-ref->connection-key model)
         :model          (model-ref->model model)
         :credentials    nil
         :ai-proxy?      true}
        {:connection-key conn-key
         :type           type
         :model          model
         :credentials    (with-field-defaults type config)
         :ai-proxy?      false}))))

;;; ------------------------------------------- Per-provider settings ----------------------------------------------

(def ^:private setting->connection-field
  "Which connection field each per-provider credential setting configures: setting keyword -> [conn-key field]."
  (into {}
        (mapcat (fn [[conn-key {:keys [settings]}]]
                  (map (fn [[field {:keys [setting]}]] [setting [conn-key field]]) settings)))
        single-provider-settings))

(defn single-provider-setting-value
  "What the per-provider credential setting `setting-kw` resolves to: the field on the connection its settings group
  configures — environment overlay and registry defaults included — or the environment value and registry default
  alone when no such connection exists.

  Backs those settings' getters, so code that has always read e.g. `llm-anthropic-api-key` keeps working now that
  the value lives on the connection list."
  [setting-kw]
  (let [[conn-key field] (get setting->connection-field setting-kw)
        group-type       (:type (get single-provider-settings conn-key))
        {:keys [type config]} (connection conn-key)]
    (if (= type group-type)
      (get (with-field-defaults type config) field)
      (or (u/trimmed-string (setting/env-var-value setting-kw))
          (get (with-field-defaults group-type {}) field)))))

(defn set-single-provider-setting!
  "Write `new-value` for the per-provider credential setting `setting-kw` into the connection its settings group
  configures, creating the connection when a non-blank value arrives for one that does not exist yet; blank clears
  the field. Values are checked against the field's own registry validation, the way the settings' old setters did.

  Backs those settings' setters, so `config.yml` provisioning and code that has always written the setting keep
  working now that the value lives on the connection list."
  [setting-kw new-value]
  (let [[conn-key field] (get setting->connection-field setting-kw)
        group-type       (:type (get single-provider-settings conn-key))
        value            (u/trimmed-string new-value)
        stored           (stored-connections)
        idx              (first (keep-indexed (fn [i conn] (when (= conn-key (:key conn)) i)) stored))]
    ;; a client echoing back the mask [[metabase.settings.core/obfuscate-value]] handed it is not entering a new
    ;; value, the same way [[metabase.settings.core/set!]] treats sensitive settings. Both forms are checked: the
    ;; mask of a newline-terminated secret (a JSON key file) matches only untrimmed, while a mask that picked up
    ;; padding in transit matches only trimmed
    (if (or (setting/obfuscated-value? new-value)
            (setting/obfuscated-value? value))
      (log/infof "Attempted to set %s to an obfuscated value. Ignoring change." (name setting-kw))
      (do
        (when value
          (validate-config-field! group-type field {field value}))
        (cond
          idx   (set-connections! (update-in stored [idx :config]
                                             (fn [config]
                                               (if value (assoc config field value) (dissoc config field)))))
          value (set-connections! (conj stored {:key    conn-key
                                                :type   group-type
                                                :name   (str (:label (provider-type group-type)))
                                                :config {field value}})))))))

;;; -------------------------------------------------- Redaction ----------------------------------------------------

(defn- secret-or-unknown-field-keys
  "The config keys to treat as secret for `type-name`, given `config`: the registry's secret fields, or — for a
  type the registry does not know, which a hand-written `llm-providers` can hold — every key, because nothing says
  which of them are credentials."
  [type-name config]
  (if (provider-type type-name)
    (secret-field-keys type-name)
    (set (keys config))))

(defn redact
  "Mask a connection's secret fields so it can be returned over the API."
  [{:keys [type config] :as conn}]
  (update conn :config
          (fn [config']
            (reduce (fn [config' field-key]
                      (cond-> config'
                        (u/trimmed-string (get config' field-key))
                        (update field-key setting/obfuscate-value)))
                    (or config' {})
                    (secret-or-unknown-field-keys type config)))))

(defn merge-config
  "Layer a client-supplied `config` over the `existing` one, keeping the stored secret whenever the client echoed
  back the mask [[redact]] handed it. Sending an explicitly blank value still clears the field."
  [type-name existing config]
  (reduce (fn [merged field-key]
            (cond-> merged
              (setting/obfuscated-value? (get config field-key))
              (assoc field-key (get existing field-key))))
          (merge existing config)
          (secret-or-unknown-field-keys type-name existing)))
