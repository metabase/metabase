(ns metabase.app-db.custom-migrations.llm-providers
  "Moves the per-provider LLM credential settings onto the `llm-providers` connection list.

  Before the list existed, an instance configured one provider per settings group — `llm-anthropic-api-key` and
  friends — and Metabot named it by provider type. The list supersedes those settings, so the migration copies them
  into it and deletes them: a credential nothing writes to any more should not sit in the app DB, and a build rolled
  back to code that still reads those settings would otherwise pick up whatever was last written there rather than
  what is actually configured. The rollback writes the list back out into them for the same reason.

  The provider table below is a frozen copy of `metabase.llm.provider`'s registry as it stood when this was written.
  Migrations must not call application code — see the `metabase.app-db.custom-migrations` namespace docstring."
  (:require
   [clojure.string :as str]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private connections-setting "llm-providers")
(def ^:private model-ref-setting "llm-metabot-provider")
(def ^:private managed-type "metabase")

(def ^:private provider-types
  "Every provider type that could be configured by its own settings, in the order the connection list shows them.

  `:settings` maps a `:config` key to the setting that carried it. `:credentials` are the keys that have to be
  present for the provider to count as configured — the rest are optional, or carry a default of their own.
  `:model-fields` name the config keys that compose the model such a connection serves, which for Azure is where its
  `{family}/{deployment}` pair ends up."
  [{:type        "anthropic"
    :name        "Anthropic"
    :settings    {:api-key "llm-anthropic-api-key" :base-url "llm-anthropic-api-base-url"}
    :credentials [:api-key]}
   {:type        "openai"
    :name        "OpenAI"
    :settings    {:api-key "llm-openai-api-key" :base-url "llm-openai-api-base-url"}
    :credentials [:api-key]}
   {:type        "openrouter"
    :name        "OpenRouter"
    :settings    {:api-key "llm-openrouter-api-key" :base-url "llm-openrouter-api-base-url"}
    :credentials [:api-key]}
   {:type        "mistral"
    :name        "Mistral"
    :settings    {:api-key "llm-mistral-api-key" :base-url "llm-mistral-api-base-url"}
    :credentials [:api-key]}
   {:type        "zai"
    :name        "Z.AI"
    :settings    {:api-key "llm-zai-api-key" :base-url "llm-zai-api-base-url"}
    :credentials [:api-key]}
   {:type        "moonshot"
    :name        "Moonshot AI"
    :settings    {:api-key "llm-moonshot-api-key" :base-url "llm-moonshot-api-base-url"}
    :credentials [:api-key]}
   {:type         "azure"
    :name         "Microsoft Azure"
    :settings     {:api-key         "llm-azure-api-key"
                   :base-url        "llm-azure-api-base-url"
                   :model-family    "llm-azure-model-family"
                   :deployment-name "llm-azure-deployment-name"}
    :credentials  [:api-key :base-url]
    :model-fields [:model-family :deployment-name]}
   {:type        "google"
    :name        "Google Gemini"
    :settings    {:service-account-key "llm-google-service-account-key"
                  :oauth-access-token  "llm-google-oauth-access-token"
                  :project-id          "llm-google-project-id"
                  :location            "llm-google-location"
                  :base-url            "llm-google-api-base-url"}
    ;; either credential will do, so completeness is checked against the pair rather than against every key
    :credentials []
    :any-of      [:service-account-key :oauth-access-token]}
   {:type        "bedrock"
    :name        "Amazon Bedrock"
    :settings    {:access-key-id     "llm-bedrock-access-key-id"
                  :secret-access-key "llm-bedrock-secret-access-key"
                  :session-token     "llm-bedrock-session-token"
                  :region            "llm-bedrock-region"}
    :credentials [:access-key-id :secret-access-key]}])

(def ^:private credential-setting-keys
  (into [] (mapcat (comp vals :settings)) provider-types))

(defn- setting-value
  [setting-key]
  (some-> (t2/query-one {:select [:value] :from :setting :where [:= :key setting-key]})
          :value
          encryption/maybe-decrypt))

(defn- non-blank
  [value]
  (when (string? value)
    (not-empty (str/trim value))))

(defn- write-setting!
  [setting-key value]
  (t2/query {:delete-from :setting :where [:= :key setting-key]})
  (t2/insert! :setting {:key setting-key :value (encryption/maybe-encrypt value)}))

;;; ------------------------------------------------------ Up ------------------------------------------------------

(defn- stored-config
  [{:keys [settings]}]
  (into {} (keep (fn [[config-key setting-key]]
                   (when-let [value (non-blank (setting-value setting-key))]
                     [config-key value])))
        settings))

(defn- model-fields-from-model-ref
  "Azure's deployment lived only in `llm-metabot-provider` before it had settings of its own, so a connection whose
  model reference already names it takes its `{family}/{deployment}` pair from there."
  [{:keys [type model-fields]} config model-ref]
  (let [[ref-key ref-model] (some-> (non-blank model-ref) (str/split #"/" 2))
        parts               (when (and (seq model-fields) (= type ref-key) ref-model)
                              (str/split ref-model #"/" (count model-fields)))]
    (if (= (count model-fields) (count parts))
      (merge config (zipmap model-fields parts))
      config)))

(defn- adopted-connections
  [model-ref]
  (into (if (str/starts-with? (str model-ref) (str managed-type "/"))
          [{:key managed-type :type managed-type :name "Metabase AI service" :config {}}]
          [])
        (keep (fn [{:keys [type name credentials any-of] :as provider}]
                (let [config (stored-config provider)]
                  (when (and (every? config credentials)
                             (or (empty? any-of) (some config any-of)))
                    {:key    type
                     :type   type
                     :name   name
                     :config (model-fields-from-model-ref provider config model-ref)}))))
        provider-types))

(defn migrate-up!
  "Copy the per-provider credential settings onto `llm-providers`, then delete them.

  The list wins when it already holds something: an instance that has configured connections has already moved on
  from these settings, and the values left in them are a stale snapshot at best."
  []
  (when-not (setting-value connections-setting)
    (let [conns (adopted-connections (setting-value model-ref-setting))]
      (when (seq conns)
        (log/infof "Migrating %d LLM provider credential setting(s) onto %s: %s"
                   (count conns) connections-setting (str/join ", " (map :key conns)))
        (write-setting! connections-setting (json/encode conns)))))
  (t2/query {:delete-from :setting :where [:in :key credential-setting-keys]}))

;;; ----------------------------------------------------- Down -----------------------------------------------------

(defn- connection-settings
  "The setting rows that carry `conn`'s credentials for code that predates the connection list, or nil when there is
  nothing to write them to."
  [{:keys [key type config]}]
  (when-let [provider (and (= key type) (first (filter #(= type (:type %)) provider-types)))]
    (keep (fn [[config-key setting-key]]
            (when-let [value (non-blank (get config config-key))]
              [setting-key value]))
          (:settings provider))))

(defn- downgraded-model-ref
  "A model reference code that predates the connection list can resolve: it addresses providers by type, so a
  connection key that is not one leaves Metabot pointed at nothing. Nil drops the setting, falling back to its
  default."
  [model-ref conns]
  (when-let [[conn-key model] (some-> (non-blank model-ref) (str/split #"/" 2))]
    (cond
      (= managed-type conn-key)                            model-ref
      (some #(= conn-key (:type %)) provider-types)        model-ref
      :else (when-let [type (:type (first (filter #(= conn-key (:key %)) conns)))]
              (when (some #(= type (:type %)) provider-types)
                (str type "/" model))))))

(defn migrate-down!
  "Write the connection list back into the per-provider settings, and drop the list so an upgrade re-reads them.

  Only a connection keyed by its own provider type can be represented: that is all the settings can express, and it
  is what the list holds for anything this migration created. Connections beyond that are dropped with a warning —
  there is nowhere to put them."
  []
  (when-let [conns (some-> (setting-value connections-setting) json/decode+kw)]
    (let [written (into {} (mapcat connection-settings) conns)
          dropped (remove connection-settings conns)]
      (doseq [[setting-key value] written]
        (write-setting! setting-key value))
      (when (seq dropped)
        (log/warnf "Dropping %d LLM provider connection(s) with no equivalent setting: %s"
                   (count dropped) (str/join ", " (map :key dropped))))
      (if-let [model-ref (downgraded-model-ref (setting-value model-ref-setting) conns)]
        (write-setting! model-ref-setting model-ref)
        (t2/query {:delete-from :setting :where [:= :key model-ref-setting]}))
      (t2/query {:delete-from :setting :where [:= :key connections-setting]}))))
