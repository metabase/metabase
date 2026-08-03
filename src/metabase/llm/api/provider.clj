(ns metabase.llm.api.provider
  "Admin endpoints for managing LLM provider connections at `/api/llm`.

  Connections are stored in the `llm-providers` setting, but the setting is never edited directly from the client:
  these endpoints present it as a collection of rows so secrets can be masked on the way out and preserved on the
  way back in, and so a connection is only saved once its credentials have been shown to work."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Schemas ----------------------------------------------------

(def ^:private field-response-schema
  [:map
   [:key :string]
   [:label :string]
   [:type [:enum "text" "password" "select"]]
   [:required :boolean]
   [:advanced :boolean]
   [:placeholder {:optional true} [:maybe :string]]
   [:default {:optional true} [:maybe :string]]
   [:help {:optional true} [:maybe :string]]
   [:docs_url {:optional true} [:maybe :string]]
   [:prefix {:optional true} [:maybe :string]]
   [:options {:optional true} [:maybe [:sequential [:map [:value :string] [:label :string]]]]]])

(def ^:private provider-type-response-schema
  [:map
   [:type :string]
   [:label :string]
   [:managed :boolean]
   [:singleton :boolean]
   [:available :boolean]
   [:default_model [:maybe :string]]
   [:fields [:sequential field-response-schema]]])

(def ^:private connection-response-schema
  [:map
   [:key :string]
   [:type :string]
   [:name :string]
   [:source [:enum "db" "env"]]
   [:usable :boolean]
   [:env_vars [:sequential :string]]
   [:config [:map-of :keyword [:maybe :string]]]])

(def ^:private llm-model-response-schema
  [:map
   [:id :string]
   [:display_name :string]
   [:group {:optional true} [:maybe :string]]])

(def ^:private models-response-schema
  [:sequential
   [:map
    [:key :string]
    [:name :string]
    [:type :string]
    [:models [:sequential llm-model-response-schema]]
    [:error {:optional true} [:maybe :string]]]])

(def ^:private config-schema
  [:map-of :keyword [:maybe :string]])

(def ^:private connection-key-schema
  [:string {:api/regex #"[a-z0-9][a-z0-9-]*"}])

;;; -------------------------------------------------- Responses ---------------------------------------------------

(defn- field-response
  [{:keys [key label type required? advanced? placeholder default help docs-url prefix options]}]
  (cond-> {:key      (name key)
           :label    (str label)
           :type     (name type)
           :required (boolean required?)
           :advanced (boolean advanced?)}
    placeholder (assoc :placeholder (str placeholder))
    default     (assoc :default default)
    help        (assoc :help (str help))
    docs-url    (assoc :docs_url docs-url)
    prefix      (assoc :prefix prefix)
    options     (assoc :options options)))

(defn- provider-type-response
  [{:keys [type label managed? singleton? default-model fields]}]
  {:type          type
   :label         (str label)
   :managed       (boolean managed?)
   :singleton     (boolean singleton?)
   :available     (llm.provider/type-available? type)
   :default_model default-model
   :fields        (mapv field-response fields)})

(defn- connection-response
  [{conn-key :key conn-name :name :keys [type source config env-vars] :as conn}]
  {:key      conn-key
   :type     type
   :name     conn-name
   :source   (name (or source :db))
   :usable   (llm.provider/config-complete? type config)
   :env_vars (vec env-vars)
   :config   (or (:config (llm.provider/redact conn)) {})})

;;; ------------------------------------------------ Model listing -------------------------------------------------

(defn- title-case-token
  [token]
  (case token
    "openai" "OpenAI"
    "claude" "Claude"
    (str/capitalize token)))

(defn- anthropic-model-group
  [{:keys [id]}]
  (let [tokens (str/split id #"-")]
    (or (some->> tokens
                 (filter #{"haiku" "sonnet" "opus"})
                 first
                 title-case-token)
        (some->> tokens
                 (take 2)
                 seq
                 (map title-case-token)
                 (str/join " ")))))

(defn- bedrock-model-group
  [{:keys [id]}]
  (cond
    (str/starts-with? id "anthropic.") "Anthropic"
    (str/starts-with? id "openai.")    "OpenAI"
    :else                              nil))

(defn- openai-model-group
  [{:keys [id]}]
  (when-let [version (second (re-find #"^gpt-(\d+(?:\.\d+)?)" id))]
    (str "GPT-" version)))

(defn- openrouter-model-group
  [{:keys [display_name id]}]
  (cond
    (and display_name (str/includes? display_name ": "))
    (-> display_name (str/split #": " 2) first)

    (and id (str/includes? id "/"))
    (-> id (str/split #"/" 2) first title-case-token)))

(defn- decorate-provider-model
  [provider model]
  (case provider
    "anthropic"  (assoc model :group (anthropic-model-group model))
    "bedrock"    (assoc model :group (bedrock-model-group model))
    "openai"     (assoc model :group (openai-model-group model))
    "openrouter" (assoc model :group (openrouter-model-group model))
    model))

(defn- decorate-provider-models
  [provider models]
  (let [decorated (map #(decorate-provider-model provider %) models)]
    (if (contains? #{"anthropic" "bedrock" "openai" "openrouter"} provider)
      (let [grouped (group-by :group decorated)]
        (->> grouped keys sort (mapcat #(get grouped %)) vec))
      (vec decorated))))

(defn- provider-client-error?
  "Whether a provider api-error is a client-side 4xx we should surface rather than treat as an outage. Covers
  rejected or missing credentials (401/403) and a request the provider refused outright."
  [error]
  (let [{:keys [api-error status status-code]} (ex-data error)
        status (or status status-code)]
    (and api-error (number? status) (<= 400 status 499))))

(defn- list-connection-models*
  "List `conn`'s models. `config-override` stands in for the stored credentials when validating a connection that has
  not been saved yet. Returns `{:models [...]}` or `{:models [] :error msg}` for a credential-level failure.

  Types whose catalog is fixed (the managed provider, which serves one model through the proxy) are answered from
  the registry — there is nothing to fetch, and calling out would fail on instances that cannot reach the proxy.

  Types that name their model in `:config` (Azure, whose deployments its listing endpoint does not return) still
  make the call, because it is what verifies the credentials, but the model they serve comes from the connection
  rather than the empty list that comes back."
  [{:keys [type config]} config-override model]
  (if-let [models (llm.provider/fixed-models type)]
    {:models (vec models)}
    (let [config           (llm.provider/with-field-defaults type (or config-override config))
          configured-model (llm.provider/connection-model type config)
          model            (or model configured-model)]
      (try
        (let [listed (:models (metabot.self/list-models type (cond-> {:credentials config}
                                                               model (assoc :model model))))]
          {:models (if configured-model
                     [{:id configured-model :display_name (last (str/split configured-model #"/"))}]
                     (decorate-provider-models type listed))})
        (catch clojure.lang.ExceptionInfo e
          (if (provider-client-error? e)
            {:models [] :error (.getMessage e)}
            (throw e)))))))

(def ^:private list-connection-models
  (memoize/ttl
   (fn [conn config-override model]
     (list-connection-models* conn config-override model))
   :ttl/threshold 60000))

(defn- connection-models-response
  [{conn-key :key conn-name :name :keys [type] :as conn}]
  (merge {:key conn-key :name conn-name :type type}
         (try
           (list-connection-models conn nil nil)
           (catch Exception e
             (log/warn e "Failed to list models for LLM provider connection" {:connection conn-key})
             {:models [] :error (.getMessage e)}))))

;;; -------------------------------------------------- Validation --------------------------------------------------

(defn- check-not-env-connection!
  "Throw a 400 when `conn` is configured by environment variables. Writes to env-shadowed settings persist to the
  app DB but the env var wins on every read, so they silently do nothing."
  [{:keys [key source]}]
  (when (= :env (keyword source))
    (throw (ex-info (tru "The {0} connection is configured by environment variables and cannot be changed here."
                         (pr-str key))
                    {:status-code 400 :connection-key key}))))

(defn- check-connections-not-env-managed!
  []
  (when (some? (setting/env-var-value :llm-providers))
    (throw (ex-info (tru "LLM provider connections are set by the {0} environment variable and cannot be changed via the API."
                         (setting/env-var-name :llm-providers))
                    {:status-code 400}))))

(defn- verify-credentials!
  "Confirm `config` can actually reach `conn`'s provider before anything is persisted, by listing its models.
  Throws a 400 carrying the provider's own message when the credentials are rejected."
  [conn config model]
  (when-not (llm.provider/managed-type? (:type conn))
    (let [{:keys [error]} (list-connection-models* conn config model)]
      (when error
        (throw (ex-info error {:status-code 400 :api-error true}))))))

(defn- fallback-model-ref
  "A model reference to fall back to once the connection Metabot was pointed at is gone: the first remaining
  connection that has a default model, or nil to leave Metabot unconfigured."
  []
  (some (fn [{:keys [key type]}]
          (when-let [model (llm.provider/default-model type)]
            (str key "/" model)))
        (llm.provider/connections)))

(defenterprise cancel-managed-ai-subscription!
  "Cancel the Metabase Cloud add-on that backs the Metabase-managed provider, called when its connection is
  removed. OSS instances have no subscription to cancel."
  metabase-enterprise.metabot.provider
  []
  nil)

(defn- metabot-has-a-usable-model?
  "Whether `llm-metabot-provider` currently names a connection that can serve requests. Callers must read this
  *before* saving a new connection: the setting's default names the `anthropic` connection, which a freshly saved
  Anthropic connection would satisfy retroactively."
  []
  (llm.provider/connection-usable?
   (llm.provider/model-ref->connection-key (metabot.settings/llm-metabot-provider))))

(defn- select-model-for-new-connection!
  "Point Metabot at a freshly created connection when it had nothing usable to run on, so connecting the first
  provider leaves the instance working rather than connected-but-with-no-model-selected. An existing selection that
  still resolves is left alone — adding a second provider must not silently switch Metabot over to it."
  [{conn-key :key :keys [type config]} requested-model]
  (when-let [model (or (not-empty requested-model)
                       (llm.provider/connection-model type config)
                       (llm.provider/default-model type))]
    (setting/set! :llm-metabot-provider (str conn-key "/" model))))

;;; -------------------------------------------------- Endpoints ---------------------------------------------------

(defn- offer-managed-first
  "Lead with the Metabase-managed provider on instances that can actually use it — it is the option we want admins
  to reach for before bringing their own key. `sort-by` is stable, so everything else keeps its registry order."
  [provider-types]
  (sort-by (fn [{:keys [type managed?]}]
             (if (and managed? (llm.provider/type-available? type)) 0 1))
           provider-types))

(api.macros/defendpoint :get "/provider-types"
  :- [:sequential provider-type-response-schema]
  "List the provider types a connection can be created for, with the credential fields each one needs."
  []
  (perms/check-has-application-permission :setting)
  (mapv provider-type-response (offer-managed-first (llm.provider/provider-types))))

(api.macros/defendpoint :get "/providers"
  :- [:sequential connection-response-schema]
  "List the configured provider connections, with their secrets masked."
  []
  (perms/check-has-application-permission :setting)
  (mapv connection-response (llm.provider/connections)))

(api.macros/defendpoint :post "/providers"
  :- connection-response-schema
  "Create a provider connection. The credentials are verified before the connection is saved."
  [_route-params
   _query-params
   {:keys [type name key config model]} :- [:map
                                            [:type :string]
                                            [:name {:optional true} [:maybe :string]]
                                            [:key {:optional true} [:maybe :string]]
                                            [:config {:optional true} [:maybe config-schema]]
                                            [:model {:optional true} [:maybe :string]]]]
  (perms/check-has-application-permission :setting)
  (check-connections-not-env-managed!)
  (let [provider-type (llm.provider/provider-type type)]
    (api/check-400 provider-type (tru "Unknown provider type {0}." (pr-str type)))
    (api/check-400 (llm.provider/type-available? type)
                   (tru "The {0} provider is not available on this instance." (pr-str type)))
    (api/check-400 (not (and (llm.provider/singleton-type? type)
                             (some #(= type (:type %)) (llm.provider/connections))))
                   (tru "The {0} provider is already connected." (pr-str type)))
    (let [conn-key (llm.provider/unique-key (or (not-empty key) type))
          config   (or config {})
          conn     {:key    conn-key
                    :type   type
                    :name   (or (not-empty name) (str (:label provider-type)))
                    :config config}]
      (llm.provider/validate-config! type config)
      (verify-credentials! conn config model)
      (let [had-usable-model? (metabot-has-a-usable-model?)]
        (llm.provider/set-connections! (conj (vec (remove #(= :env (keyword (:source %)))
                                                          (llm.provider/connections)))
                                             conn))
        (when-not had-usable-model?
          (select-model-for-new-connection! conn model)))
      (connection-response (assoc conn :source :db)))))

(api.macros/defendpoint :put "/providers/:key"
  :- connection-response-schema
  "Update a provider connection. Secret fields the client echoes back masked keep their stored value."
  [{conn-key :key} :- [:map [:key connection-key-schema]]
   _query-params
   {:keys [name config model]} :- [:map
                                   [:name {:optional true} [:maybe :string]]
                                   [:config {:optional true} [:maybe config-schema]]
                                   [:model {:optional true} [:maybe :string]]]]
  (perms/check-has-application-permission :setting)
  (check-connections-not-env-managed!)
  (let [stored   (vec (remove #(= :env (keyword (:source %))) (llm.provider/connections)))
        idx      (first (keep-indexed (fn [i c] (when (= (:key c) conn-key) i)) stored))
        _        (api/check-404 idx)
        existing (nth stored idx)
        _        (check-not-env-connection! (llm.provider/connection conn-key))
        merged   (cond-> existing
                   (some? config)     (assoc :config (llm.provider/merge-config (:type existing)
                                                                                (:config existing)
                                                                                config))
                   (not-empty name)   (assoc :name name))]
    (llm.provider/validate-config! (:type merged) (:config merged))
    (verify-credentials! merged (:config merged) model)
    (llm.provider/set-connections! (assoc stored idx merged))
    (connection-response (assoc merged :source :db))))

(api.macros/defendpoint :delete "/providers/:key" :- :nil
  "Delete a provider connection."
  [{conn-key :key} :- [:map [:key connection-key-schema]]]
  (perms/check-has-application-permission :setting)
  (check-connections-not-env-managed!)
  (let [conn (llm.provider/connection conn-key)]
    (api/check-404 conn)
    (check-not-env-connection! conn)
    (when (llm.provider/managed-type? (:type conn))
      (cancel-managed-ai-subscription!))
    (let [remaining (vec (remove #(or (= :env (keyword (:source %)))
                                      (= (:key %) conn-key))
                                 (llm.provider/connections)))]
      (llm.provider/set-connections! remaining)
      (when (= conn-key (llm.provider/model-ref->connection-key (metabot.settings/llm-metabot-provider)))
        (setting/set! :llm-metabot-provider (fallback-model-ref)))))
  nil)

(api.macros/defendpoint :get "/models"
  :- models-response-schema
  "List the models available from every configured connection, grouped by connection.

  A connection whose credentials are rejected comes back with an empty model list and an `error`, so one bad
  connection does not blank out the others."
  []
  (perms/check-has-application-permission :setting)
  (into []
        (pmap connection-models-response (llm.provider/connections))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` provider routes."
  (api.macros/ns-handler *ns*))
