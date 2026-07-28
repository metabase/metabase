(ns metabase.metabot.settings
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.openai :as openai]
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

(def ^:private proxied-models
  "Models the Metabase managed AI proxy will serve, keyed by the wire family that fronts them."
  {"anthropic" #{"claude-sonnet-4-6"}})

(defn- validate-managed-model!
  [model]
  (let [family       (llm.provider/model-ref->connection-key model)
        inner-model  (llm.provider/model-ref->model model)
        allowed      (get proxied-models family)]
    (when-not allowed
      (throw (ex-info (tru "Unsupported provider {0} for Metabase managed AI. Supported providers: {1}"
                           (pr-str family)
                           (str/join ", " (sort (keys proxied-models))))
                      {:status-code 400 :provider family})))
    (when-not (contains? allowed inner-model)
      (throw (ex-info (tru "Unsupported model {0} for Metabase managed provider {1}. Supported models: {2}"
                           (pr-str inner-model) (pr-str family) (str/join ", " (sort allowed)))
                      {:status-code 400 :provider family :model inner-model})))))

(defn- validate-metabot-provider!
  "Validate that `value` is a `connection-key/model` string with a non-blank model, plus whatever extra rules the
  named connection's provider type imposes on its models.

  Deliberately does *not* require the connection to exist. The setting can legitimately be written before the
  connection it names — an env var, a config file, or a serdes import can land in either order — and a value naming
  a missing connection is already reported where it is actionable: [[llm-metabot-configured?]] reads false, and
  resolving it for a request throws a 400 that names the connection.

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
                        (validate-metabot-provider! new-value))
                      (setting/set-value-of-type! :string :llm-metabot-provider new-value)))

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
  "Whether a model reference names a model that streams its reasoning back to us."
  [model-ref]
  (let [{:keys [type model]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic" (claude/reasoning-model? model)
      "openai"    (openai/reasoning-model? model)
      false)))

(defsetting llm-metabot-supports-reasoning?
  "Whether the selected Metabot model streams its reasoning."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(llm-provider-streams-reasoning? (llm-metabot-provider))
  :doc        false)

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

Once a day, Metabase deletes rows older than this threshold. The minimum value is 30 days (Metabase will treat entered values of 1 to 29 the same as 30).
If set to 0, Metabase will keep all rows.")
