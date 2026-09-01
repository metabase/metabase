(ns metabase.metabot.settings
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google :as google]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]
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
  (deferred-tru "The display name for Metabot, shown throughout the Metabase UI.")
  :type       :string
  :default    "Metabot"
  :visibility :public
  :encryption :no
  :export?    true
  :feature    :ai-controls)

(defsetting metabot-icon
  (deferred-tru "The icon for Metabot. Set to `metabot` for the default icon, or a data URI for a custom uploaded image (up to 1MB).")
  :type       :string
  :default    "metabot"
  :visibility :public
  :encryption :no
  :export?    true
  :feature    :ai-controls)

(defsetting metabot-show-illustrations
  (deferred-tru "Whether to show Metabot illustrations in the UI.")
  :type       :boolean
  :default    true
  :visibility :public
  :encryption :no
  :export?    true
  :feature    :ai-controls)

(defsetting metabot-chat-system-prompt
  (deferred-tru "Custom instructions appended to Metabot''s system prompt for the chat experience (the AI sidebar and embedded Metabot).")
  :type       :string
  :default    ""
  :visibility :admin
  :encryption :when-encryption-key-set
  :export?    true
  :feature    :ai-controls)

(defsetting metabot-nlq-system-prompt
  (deferred-tru "Custom instructions appended to Metabot''s system prompt for the natural language query (AI exploration) experience.")
  :type       :string
  :default    ""
  :visibility :admin
  :encryption :when-encryption-key-set
  :export?    true
  :feature    :ai-controls)

(defsetting metabot-sql-system-prompt
  (deferred-tru "Custom instructions appended to Metabot''s system prompt for the SQL generation experience.")
  :type       :string
  :default    ""
  :visibility :admin
  :encryption :when-encryption-key-set
  :export?    true
  :feature    :ai-controls)

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

(def default-llm-metabot-provider
  "Default model reference used for Metabot when no explicit model is selected."
  "anthropic/claude-sonnet-4-6")

(def default-metabase-llm-metabot-provider
  "Managed-provider version of [[default-llm-metabot-provider]]."
  (str llm.provider/managed-connection-key "/" default-llm-metabot-provider))

(def azure-model-families
  "Wire-protocol families for models hosted on Azure: the first segment of the azure model
  string `{family}/{deployment-name}`, selecting the Anthropic or OpenAI wire protocol."
  #{"anthropic" "openai"})

(defn validate-azure-model!
  "Validate the model segment of an azure connection's `{family}/{deployment-name}` model:
  a supported wire family followed by a non-blank deployment name without slashes
  (Azure deployment names cannot contain `/`). Throws on invalid input."
  [value model]
  (let [[family deployment] (str/split (str model) #"/" 2)]
    (when-not (and (contains? azure-model-families family)
                   (not (str/blank? deployment))
                   (not (str/includes? deployment "/")))
      (throw (ex-info (tru "Invalid Azure model {0}. Expected format: <connection>/<family>/<deployment-name> where <family> is one of: {1}"
                           (pr-str value)
                           (str/join ", " (sort azure-model-families)))
                      {:status-code 400
                       :value       value})))))

(defn- validate-google-model!
  "Validate the model segment of a google connection's `{publisher}/{model-id}` model.
  A publisher this provider serves followed by a non-blank model ID without slashes (the ID is one path segment of the
  request URL).  Throws on invalid input."
  [value model]
  (let [[publisher model-id] (str/split (str model) #"/" 2)]
    (when-not (and (contains? google/model-publishers publisher)
                   (not (str/blank? model-id))
                   (not (str/includes? model-id "/")))
      (throw (ex-info (tru "Invalid Google model {0}. Expected format: <connection>/<publisher>/<model> where <publisher> is one of: {1}"
                           (pr-str value)
                           (str/join ", " (sort google/model-publishers)))
                      {:status-code 400
                       :value       value})))))

(defn- validate-managed-model!
  "Check `model` against the fixed catalog the Metabase AI proxy serves (see the `metabase` entry in
  [[metabase.llm.provider/provider-types]])."
  [model]
  (let [allowed (into #{} (map :id) (llm.provider/fixed-models llm.provider/managed-connection-key))]
    (when-not (contains? allowed model)
      (throw (ex-info (tru "Unsupported model {0} for Metabase managed AI. Supported models: {1}"
                           (pr-str model) (str/join ", " (sort allowed)))
                      {:status-code 400 :model model})))))

(defn- validate-model-ref!
  "Validate that `value` is a `connection-key/model` string with a non-blank model, plus whatever extra rules the
  named connection's provider type imposes on its models.

  Deliberately does *not* require the connection to exist. A model-reference setting can legitimately be written
  before the connection it names — an env var, a config file, or a serdes import can land in either order — and a
  value naming a missing connection is already reported where it is actionable: [[llm-metabot-configured?]] reads
  false, and resolving it for a request throws a 400 that names the connection.

  Throws an exception with `:status-code 400` on invalid input."
  [value]
  (when-not (string? value)
    (throw (ex-info (tru "Metabot provider must be a string, got: {0}" (pr-str value))
                    {:status-code 400})))
  (let [model (llm.provider/model-ref->model value)]
    (when (str/blank? model)
      (throw (ex-info (tru "Model name is required. Expected format: connection/model, e.g. \"anthropic/claude-haiku-4-5\"")
                      {:status-code 400 :value value})))
    (case (:type (llm.provider/connection (llm.provider/model-ref->connection-key value)))
      "azure"    (validate-azure-model! value model)
      "google"   (validate-google-model! value model)
      "metabase" (validate-managed-model! model)
      nil)))

(defsetting llm-metabot-provider
  (deferred-tru "The AI provider connection and model for Metabot. Format: connection-key/model-name, e.g. `anthropic/claude-haiku-4-5`, `openai/gpt-5.4`, `openrouter/anthropic/claude-haiku-4.5`. The connection key names an entry in the `llm-providers` setting and defaults to the provider type.")
  :type             :string
  :encryption       :no
  :default          default-llm-metabot-provider
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-ai-metabot-provider
  :setter           (fn [new-value]
                      (when new-value
                        (validate-model-ref! new-value))
                      (setting/set-value-of-type! :string :llm-metabot-provider new-value)))

(defn- mini-model-ref
  "The model reference for the fastest model of the connection `model-ref` names, or nil when that connection's
  provider type has no such model."
  [model-ref]
  (let [conn-key (llm.provider/model-ref->connection-key model-ref)]
    (when-let [model (llm.provider/mini-model (:type (llm.provider/connection conn-key)))]
      (str conn-key "/" model))))

(defn explicit-mini-model
  "The model reference [[llm-mini-model]] was explicitly set to, or nil while it is being derived
  from [[llm-metabot-provider]]. Callers that act on the admin's choice rather than on the model quick tasks happen
  to run on want this: [[llm-mini-model]] itself resolves, so it names a connection even when none was ever picked."
  []
  (setting/get-value-of-type :string :llm-mini-model))

(defn- -llm-mini-model
  "Quick background tasks — naming a conversation, and whatever short, high-volume calls come next — do not need the
  model Metabot chats on, so with nothing stored this resolves to the fastest model of the
  connection [[llm-metabot-provider]] names. Connections whose provider type has no such model — the ones that name
  the single model they serve, and the managed provider — fall through to the Metabot model itself, so this always
  names a model as long as Metabot does."
  []
  (or (explicit-mini-model)
      (let [metabot-ref (llm-metabot-provider)]
        (or (mini-model-ref metabot-ref) metabot-ref))))

(defsetting llm-mini-model
  (deferred-tru "The AI provider connection and model used for quick background tasks, such as naming Metabot conversations, in the same connection-key/model-name format as `llm-metabot-provider`. Defaults to the fastest model offered by the connection Metabot runs on.")
  :type       :string
  :encryption :no
  :visibility :settings-manager
  :export?    false
  :getter     #'-llm-mini-model
  :setter     (fn [new-value]
                (when new-value
                  (validate-model-ref! new-value))
                (setting/set-value-of-type! :string :llm-mini-model new-value)))

(defsetting llm-metabot-configured?
  "Whether the connection selected for Metabot has the credentials it needs."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(llm.provider/connection-usable?
                (llm.provider/model-ref->connection-key (llm-metabot-provider)))
  :doc        false)

(defn- llm-provider-streams-reasoning?
  "Whether a model reference names a model that streams its reasoning back to us.

  Anthropic and OpenAI answer from the model name, because thinking is requested in the request body. vLLM answers
  from what its connect-time probe observed and recorded on the connection — the flag depends on the operator's
  `--reasoning-parser` as well as on the model, so the name cannot settle it."
  [model-ref]
  (let [{:keys [type model credentials]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic"  (claude/reasoning-model? model)
      "deepseek"   (deepseek/reasoning-model? model)
      "openai"     (openai/reasoning-model? model)
      "openrouter" (openrouter/reasoning-model? model)
      "google"     (google/reasoning-model? model)
      "vllm"       (vllm/reasoning-connection? credentials)
      "zai"        (zai/reasoning-model? model)
      false)))

(defsetting llm-metabot-supports-reasoning?
  "Whether the selected Metabot model streams its reasoning."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(llm-provider-streams-reasoning? (llm-metabot-provider))
  :doc        false)

(defn- llm-provider-supports-fast-mode?
  "Whether a model reference names a model we can serve in Anthropic fast mode.

  Anthropic-only and BYOK-only: fast mode is premium-priced, and proxied connections bill through
  Metabase Cloud rather than the instance's own API key."
  [model-ref]
  (let [{:keys [type model ai-proxy?]} (llm.provider/resolve-model-ref model-ref)]
    (boolean (and (= type "anthropic")
                  (not ai-proxy?)
                  (claude/fast-mode-model? model)))))

(defsetting llm-metabot-supports-fast-mode?
  "Whether the selected Metabot model can run in fast mode. Settings-manager rather than public:
  only the admin page reads it, and a public value would tell unauthenticated callers which
  provider and model tier serves Metabot."
  :type       :boolean
  :visibility :settings-manager
  :setter     :none
  :export?    false
  :getter     #(llm-provider-supports-fast-mode? (llm-metabot-provider))
  :doc        false)

(defsetting llm-fast-mode
  (deferred-tru "Run Metabot in the provider''s fast mode when the selected model supports it. Fast mode responds faster at a higher price per token; on Anthropic it requires an account enrolled in the fast-mode research preview and is not available with a Priority Tier commitment.")
  :type       :boolean
  :default    false
  :visibility :settings-manager
  :export?    false)

(def ^:private metabot-llm-setting-keys
  #{:metabot-enabled? :embedded-metabot-enabled? :llm-metabot-provider})

(defn llm-configuration-setting?
  "True when changing `setting-key` could change whether Metabot can reach an LLM — i.e. it
  feeds [[llm-metabot-configured?]] or one of the Metabot enable settings.

  Matches all of [[metabase.llm.settings]] rather than a hand-listed key set: being broad
  costs a redundant re-check, while missing a key silently strands callers that wake on it."
  [setting-key]
  (boolean
   (or (contains? metabot-llm-setting-keys setting-key)
       (= 'metabase.llm.settings
          (:namespace (get @setting/registered-settings setting-key))))))

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
- `agent_api_call_log`

Once a day, Metabase deletes rows older than this threshold. The minimum value is 30 days (Metabase will treat entered values of 1 to 29 the same as 30).
If set to 0, Metabase will keep all rows. If you don't set this variable, Metabase keeps rows for 180 days.")
