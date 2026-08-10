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
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Provider types ------------------------------------------------

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
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-ant-api03-..."
                     :prefix      "sk-ant-"
                     :docs-url    "https://console.anthropic.com/settings/keys"}
                    {:key       :base-url
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.anthropic.com"}]}
   {:type          "openai"
    :label         (deferred-tru "OpenAI")
    :default-model "gpt-5.4"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-proj-..."
                     :prefix      "sk-"
                     :docs-url    "https://platform.openai.com/api-keys"}
                    {:key       :base-url
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.openai.com"}]}
   {:type          "openrouter"
    :label         (deferred-tru "OpenRouter")
    :default-model "anthropic/claude-sonnet-4.6"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-or-v1-..."
                     :prefix      "sk-or-v1-"
                     :docs-url    "https://openrouter.ai/keys"}
                    {:key       :base-url
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://openrouter.ai/api"}]}
   {:type          "mistral"
    :label         (deferred-tru "Mistral")
    :default-model "mistral-medium-3-5"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     ;; Mistral keys have no recognizable prefix.
                     :placeholder (deferred-tru "Enter your Mistral API key")
                     :docs-url    "https://console.mistral.ai/api-keys"}
                    {:key       :base-url
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.mistral.ai/v1"}]}
   {:type          "zai"
    :label         (deferred-tru "Z.AI")
    :default-model "glm-5.2"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     ;; Z.AI keys are `{id}.{secret}` pairs with no documented prefix.
                     :placeholder (deferred-tru "Enter your Z.AI API key")
                     :docs-url    "https://z.ai/manage-apikey/apikey-list"}
                    {:key       :base-url
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.z.ai/api/paas/v4"}]}
   {:type          "moonshot"
    :label         (deferred-tru "Moonshot AI")
    :default-model "kimi-k3"
    :fields        [{:key         :api-key
                     :label       (deferred-tru "API key")
                     :type        :password
                     :required?   true
                     :placeholder "sk-..."
                     :docs-url    "https://platform.kimi.ai/console/api-keys"}
                    {:key       :base-url
                     :label     (deferred-tru "API base URL")
                     :type      :text
                     :advanced? true
                     :default   "https://api.moonshot.ai/v1"
                     :help      (deferred-tru "Point this at the .cn platform to use it instead; keys are not interchangeable between the two.")}]}
   {:type          "google"
    :label         (deferred-tru "Google Gemini")
    :default-model "google/gemini-3.5-flash"
    ;; The Gemini Enterprise Agent Platform has no listing endpoint we can trust — the one it exposes reports models
    ;; that are not really available and omits ones that are — so the models Metabot is known to work with are fixed
    ;; here, and connecting validates the credentials against one of them with a free `countTokens` probe. Which of
    ;; them a project can actually reach depends on its location.
    :models        [{:id "google/gemini-3.5-flash" :display_name "gemini-3.5-flash"}
                    {:id "google/gemini-3.6-flash" :display_name "gemini-3.6-flash"}]
    :fields        [{:key         :project-id
                     :label       (deferred-tru "Project ID")
                     :type        :text
                     :placeholder (deferred-tru "my-project")
                     :help        (deferred-tru "The Google Cloud project to use. Optional if the service account key provides it.")
                     :docs-url    "https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects"}
                    {:key       :location
                     :label     (deferred-tru "Location")
                     :type      :text
                     :placeholder "global"
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
  "The `:config` keys of `type-name` that hold secrets."
  [type-name]
  (into #{}
        (comp (filter #(= :password (:type %))) (map :key))
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
  [type-name {:keys [key label required? prefix default]} config]
  (let [value (u/trimmed-string (get config key))]
    (when (and required? (not value) (not default))
      (throw (ex-info (tru "{0} is required for {1}." (str label) type-name)
                      {:status-code 400 :field key})))
    (when (and value prefix (not (str/starts-with? value prefix)))
      (throw (ex-info (tru "Invalid {0} for {1}. It must start with ''{2}''." (str label) type-name prefix)
                      {:status-code 400 :field key})))))

(defn validate-config!
  "Check a connection's `:config` against its provider type's field descriptors: required fields are present, and
  fields that declare a `:prefix` start with it. Throws a 400 on the first problem."
  [type-name config]
  (when-not (provider-type type-name)
    (throw (ex-info (tru "Unknown provider type {0}." (pr-str type-name))
                    {:status-code 400 :type type-name})))
  (doseq [field (:fields (provider-type type-name))]
    (validate-field! type-name field config)))

(defn credentials-complete?
  "Whether `config` carries the credentials a request needs.

  A required field the registry gives a `:default` counts as carried: [[with-field-defaults]] supplies it when the
  connection is resolved, so leaving it untouched is the admin accepting the value its form showed.

  [[model-fields]] are exempt: they name what to call, not what authenticates the call, and a connection can
  legitimately take its model from the `connection-key/model` reference instead — which is where an Azure
  deployment configured before the connection list existed still lives. [[validate-config!]] still requires them
  of anything saved through the API, so only the environment and a hand-written `llm-providers` can omit them."
  [type-name config]
  (let [model-keys (set (model-fields type-name))]
    (every? (fn [{:keys [key required? default]}]
              (or (not required?)
                  default
                  (contains? model-keys key)
                  (u/trimmed-string (get config key))))
            (:fields (provider-type type-name)))))

(defn config-complete?
  "Whether a connection of `type-name` can make requests: [[credentials-complete?]], or for the Metabase-managed
  provider — which authenticates with the instance token rather than with credentials of its own — whether the LLM
  proxy is configured."
  [type-name config]
  (if (managed-type? type-name)
    (some? (llm.settings/llm-proxy-base-url))
    (credentials-complete? type-name config)))

;;; ---------------------------------------- Connections configured by env var ------------------------------------

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
   "google"     {:type     "google"
                 :settings {:service-account-key {:setting :llm-google-service-account-key :credential? true}
                            :oauth-access-token  {:setting :llm-google-oauth-access-token :credential? true}
                            :project-id          {:setting :llm-google-project-id}
                            :location            {:setting :llm-google-location}
                            :base-url            {:setting :llm-google-api-base-url}}}
   "azure"      {:type     "azure"
                 :settings {:api-key         {:setting :llm-azure-api-key :credential? true}
                            :base-url        {:setting :llm-azure-api-base-url :credential? true}
                            :model-family    {:setting :llm-azure-model-family}
                            :deployment-name {:setting :llm-azure-deployment-name}}}
   "bedrock"    {:type     "bedrock"
                 :settings {:access-key-id     {:setting :llm-bedrock-access-key-id :credential? true}
                            :secret-access-key {:setting :llm-bedrock-secret-access-key :credential? true}
                            :session-token     {:setting :llm-bedrock-session-token}
                            :region            {:setting :llm-bedrock-region}}}})

(defn- single-provider-setting-values
  [settings value-fn]
  (into {}
        (keep (fn [[config-key {:keys [setting]}]]
                (when-let [value (u/trimmed-string (value-fn setting))]
                  [config-key value])))
        settings))

(defn- env-configured-connection
  [conn-key {:keys [type settings]}]
  (let [env-set? (fn [config-key]
                   (some? (setting/env-var-value (get-in settings [config-key :setting]))))]
    (when (some (fn [[config-key {:keys [credential?]}]]
                  (and credential? (env-set? config-key)))
                settings)
      {:key      conn-key
       :type     type
       :name     (str (:label (provider-type type)))
       :source   :env
       :env-vars (into (sorted-set)
                       (keep (fn [[config-key {:keys [setting]}]]
                               (when (env-set? config-key)
                                 (setting/env-var-name setting))))
                       settings)
       :config   (single-provider-setting-values settings #(setting/get-value-of-type :string %))})))

(defn- env-connections
  "Connections configured by the single-provider `MB_LLM_*` environment variables.

  Resolved on every read, so editing one of those variables takes effect on the next restart without anything
  having to be migrated or re-saved."
  []
  (into []
        (keep (fn [[conn-key spec]] (env-configured-connection conn-key spec)))
        single-provider-settings))

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
  variables. Each carries a `:source` of `:db` or `:env`; `:env` connections are read-only, because a write to an
  env-shadowed setting would be silently ignored on the next read.

  On a key collision the environment wins and replaces the stored connection in place, matching how the settings
  system resolves an env var over an app-DB value. Letting the stored one win would mean an admin edit silently
  shadowed the environment while the credentials in use came from somewhere the UI never showed."
  []
  (let [from-env (env-connections)
        by-key   (into {} (map (juxt :key identity)) from-env)
        stored   (map (fn [conn] (get by-key (:key conn) conn)) (annotated-stored-connections))
        taken    (into #{} (map :key) stored)]
    (into (vec stored) (remove #(contains? taken (:key %)) from-env))))

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
  "Persist `conns` as the stored connection list, dropping the derived `:source` key."
  [conns]
  (llm.settings/llm-providers! (mapv #(dissoc % :source) conns)))

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

(def managed-connection-key
  "The connection key reserved for the Metabase-managed provider. Requests for it are routed through the LLM proxy
  and authenticated with the instance token."
  "metabase")

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
  "Fill in each field's registry `:default` wherever `config` left it blank, so a resolved connection carries
  everything the adapter needs. Without this an adapter would have to reach back into the single-provider
  settings for a missing base URL, which is how one connection ends up answering with another's configuration."
  [type-name config]
  (reduce (fn [config {:keys [key default]}]
            (cond-> config
              (and default (not (u/trimmed-string (get config key))))
              (assoc key default)))
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

(defn proxied-model-ref?
  "Whether requests for `model-ref` are routed through the Metabase AI proxy."
  [model-ref]
  (boolean (:ai-proxy? (resolve-model-ref model-ref))))

;;; -------------------------------------------------- Redaction ----------------------------------------------------

(defn redact
  "Mask a connection's secret fields so it can be returned over the API."
  [{:keys [type] :as conn}]
  (update conn :config
          (fn [config]
            (reduce (fn [config field-key]
                      (cond-> config
                        (u/trimmed-string (get config field-key))
                        (update field-key setting/obfuscate-value)))
                    (or config {})
                    (secret-field-keys type)))))

(defn merge-config
  "Layer a client-supplied `config` over the `existing` one, keeping the stored secret whenever the client echoed
  back the mask [[redact]] handed it. Sending an explicitly blank value still clears the field."
  [type-name existing config]
  (reduce (fn [merged field-key]
            (cond-> merged
              (setting/obfuscated-value? (get config field-key))
              (assoc field-key (get existing field-key))))
          (merge existing config)
          (secret-field-keys type-name)))
