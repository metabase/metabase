(ns metabase.llm.api.provider
  "Admin endpoints for managing LLM provider connections at `/api/llm`.

  Connections are stored in the `llm-providers` setting, but the setting is never edited directly from the client:
  these endpoints present it as a collection of rows so secrets can be masked on the way out and preserved on the
  way back in, and so a connection is only saved once its credentials have been shown to work."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.cache.wrapped :as cache.wrapped]
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
   [:type [:enum "text" "password" "select" "segmented" "file"]]
   [:required :boolean]
   [:advanced :boolean]
   [:placeholder {:optional true} [:maybe :string]]
   [:default {:optional true} [:maybe :string]]
   [:help {:optional true} [:maybe :string]]
   [:docs_url {:optional true} [:maybe :string]]
   [:prefix {:optional true} [:maybe :string]]
   [:options {:optional true} [:maybe [:sequential [:map [:value :string] [:label :string]]]]]
   ;; the field is only shown, and only sent, while the named field holds this value
   [:show_when {:optional true} [:maybe [:map [:field :string] [:value :string]]]]])

(def ^:private provider-type-response-schema
  [:map
   [:type :string]
   [:label :string]
   [:managed :boolean]
   [:singleton :boolean]
   [:available :boolean]
   [:default_model [:maybe :string]]
   ;; the fixed catalog, for types whose models cannot be listed from the provider; the connection form offers
   ;; these so the connect-time credential probe runs against the model the admin actually wants
   [:models [:sequential [:map [:id :string] [:display_name :string]]]]
   ;; alternative credential groups: the connection is complete when one group is filled in full
   [:required_any [:sequential [:sequential :string]]]
   [:fields [:sequential field-response-schema]]])

(def ^:private connection-response-schema
  [:map
   [:key :string]
   [:type :string]
   [:name :string]
   [:source [:enum "db" "env"]]
   [:usable :boolean]
   [:env_vars [:sequential :string]]
   [:env_fields [:sequential :string]]
   [:config [:map-of :keyword [:maybe :string]]]])

(def ^:private llm-model-response-schema
  [:map
   [:id :string]
   [:display_name :string]])

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

(defn- option-response
  [{:keys [value label]}]
  {:value value :label (str label)})

(defn- field-response
  [{:keys [key label type required? advanced? placeholder default help docs-url prefix options show-when]}]
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
    options     (assoc :options (mapv option-response options))
    show-when   (assoc :show_when {:field (name (:field show-when)) :value (:value show-when)})))

(defn- provider-type-response
  [{:keys [type label managed? singleton? default-model required-any fields]}]
  {:type          type
   :label         (str label)
   :managed       (boolean managed?)
   :singleton     (boolean singleton?)
   :available     (llm.provider/type-available? type)
   :default_model default-model
   :models        (mapv #(select-keys % [:id :display_name]) (llm.provider/fixed-models type))
   :required_any  (mapv #(mapv name %) required-any)
   :fields        (mapv field-response fields)})

(defn- connection-response
  [{conn-key :key conn-name :name :keys [type source config env-vars env-fields] :as conn}]
  {:key        conn-key
   :type       type
   :name       conn-name
   :source     (name (or source :db))
   :usable     (llm.provider/config-complete? type config)
   :env_vars   (vec env-vars)
   ;; the config keys the environment owns; the form disables exactly these inputs
   :env_fields (mapv name env-fields)
   :config     (or (:config (llm.provider/redact conn)) {})})

;;; ------------------------------------------------ Model listing -------------------------------------------------

(defn- provider-client-error?
  "Whether a provider api-error is a client-side 4xx we should surface rather than treat as an outage. Covers
  rejected or missing credentials (401/403) and a request the provider refused outright."
  [error]
  (let [{:keys [api-error status status-code]} (ex-data error)
        status (or status status-code)]
    (and api-error (number? status) (<= 400 status 499))))

(defn- selected-model
  "The model `llm-metabot-provider` names for `conn-key`, or nil when the selection points elsewhere.

  What a connection is verified against when the client names no model: for a type that checks more than its
  credentials, the model the connection is actually serving is a better probe target than whichever one the
  provider happens to list first."
  [conn-key]
  (let [model-ref (metabot.settings/llm-metabot-provider)]
    (when (= conn-key (llm.provider/model-ref->connection-key model-ref))
      (llm.provider/model-ref->model model-ref))))

(defn- list-connection-models*
  "List `conn`'s models. `config-override` stands in for the stored credentials when validating a connection that has
  not been saved yet. Returns `{:models [...]}` or `{:models [...] :error msg}` for a client-level failure.

  The managed provider is answered from the registry — it serves one model through the proxy, there is nothing to
  fetch, and calling out would fail on instances that cannot reach it.

  A type whose catalog is fixed but whose credentials are its own (Google, whose listing endpoint reports models
  that are not really available) still makes the call, because it is what verifies those credentials; the catalog
  comes from the registry, and the call is made against the model this connection is known to serve.

  `:model` is a request the type must honour or fail. `:proposed-model` is only our guess at what this connection
  serves — the `:probed-model` an earlier probe recorded, or the catalog's first entry — which a type is free to
  ignore.

  A type that names its model in `:config` (Azure, whose deployments its listing endpoint does not return) makes
  the call for the same reason, but the model it serves comes from the connection rather than from the empty list
  that comes back.

  `probe?` asks a type that can check more than its credentials to do so — vLLM exercises the tool calling and
  structured output the agent loop depends on against the model it will run on. Only [[verify-credentials!]] sets
  it: a probe generates, so it is far too slow for a plain listing. A probe reports whatever it determined about the
  connection as `:learned-config`, passed through here for [[verify-credentials!]]'s callers to store on it."
  [{conn-key :key :keys [type config]} config-override model probe?]
  (let [fixed (llm.provider/fixed-models type)]
    (if (llm.provider/managed-type? type)
      {:models (vec fixed)}
      (let [config           (llm.provider/with-field-defaults type (or config-override config))
            configured-model (llm.provider/connection-model type config)
            ;; Our best guess at the model to try if caller did not specify a model.
            proposed-model   (or (:probed-model config) (:id (first fixed)))
            model            (or model configured-model (selected-model conn-key))
            config-models    (cond
                               configured-model [{:id           configured-model
                                                  :display_name (last (str/split configured-model #"/"))}]
                               fixed            (vec fixed))]
        (try
          (let [listed (metabot.self/list-models type (cond-> {:credentials config}
                                                        model          (assoc :model model)
                                                        proposed-model (assoc :proposed-model proposed-model)
                                                        probe?         (assoc :probe? true)))]
            (merge (select-keys listed [:learned-config])
                   {:models (or config-models (vec (:models listed)))}))
          (catch clojure.lang.ExceptionInfo e
            (if (provider-client-error? e)
              ;; Keep offering config-models, otherwise admin has no way to select a different model to fix "model not
              ;; served in given region" errors.
              {:models (or config-models []) :error (.getMessage e)}
              (throw e))))))))

(def ^:private models-cache-ttl-ms
  "How long a connection's model list is reused. Long enough that an admin page load does not fan out to every
  provider on every render, short enough that a model a provider has just granted shows up without a restart."
  60000)

(defonce ^:private models-cache
  (atom (cache/ttl-cache-factory {} :ttl models-cache-ttl-ms)))

(defn- models-cache-key
  "What a cached model list is filed under. The config is reduced to a hash rather than held as-is: it carries the
  connection's API key, and a cache entry outlives the connection that produced it. Hashing it also retires the
  entry the moment a credential is rotated, instead of serving the old list until the TTL runs out.

  The selected model is part of the key because it is what a listing is verified against when the client names no
  model. Repointing Metabot at a model the connection cannot serve has to retire a cached success, and picking a
  model that works again has to retire the cached error, rather than either standing until the TTL runs out."
  [{conn-key :key :keys [type config]}]
  [conn-key type (hash config) (selected-model conn-key)])

(defn- connection-models-response
  [{conn-key :key conn-name :name :keys [type] :as conn}]
  (merge {:key conn-key :name conn-name :type type}
         (try
           (cache.wrapped/lookup-or-miss models-cache (models-cache-key conn)
                                         (fn [_] (list-connection-models* conn nil nil false)))
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

(defn- refresh-settings!
  "Pull in the setting changes another instance has committed, before reading the connection list.

  The whole list lives in one setting, and settings are cached in process, so an instance only learns about
  another's edit when its cache next polls — once a minute. Until then it answers a page load with a list that
  predates the edit, and it decides whether an edit is allowed against that same list: a connection another
  instance has just deleted still looks present, and the type it belonged to still reports itself as connected.

  Costs the one query that reads `settings-last-updated`, unless something has actually changed.

  This closes the window, it does not make a write safe: for that a write has to decide and commit under
  [[llm.provider/with-connection-write-lock]]."
  []
  (setting/restore-cache-if-needed! :force-check? true))

(defn- new-connection-key
  "The key a new connection of `type` will be filed under: the reserved key for the Metabase-managed provider, and
  otherwise `desired` — defaulting to the type, so the first Anthropic connection is `anthropic` — slugged and
  suffixed until it does not collide with a connection that already exists."
  [type desired]
  (if (llm.provider/managed-type? type)
    llm.provider/managed-connection-key
    (llm.provider/unique-key (or (not-empty desired) type))))

(defn- check-can-create-connection!
  "Reject a create the current connection list has no room for.

  Every check here is a question about what is already stored, so the answer is only as good as the list the
  caller read. Callers ask twice: once up front to fail before probing the provider, and again under
  [[llm.provider/with-connection-write-lock]] against a list no sibling instance can be mid-write on."
  [type conn-key]
  (api/check-400 (not (and (llm.provider/singleton-type? type)
                           (some #(= type (:type %)) (llm.provider/connections))))
                 (tru "The {0} provider is already connected." (pr-str type)))
  (api/check-400 (not (and (llm.provider/managed-type? type)
                           (llm.provider/connection llm.provider/managed-connection-key)))
                 (tru "Another connection holds the {0} key. Remove it before connecting the Metabase AI service."
                      (pr-str llm.provider/managed-connection-key)))
  ;; the `metabase/` model-ref prefix means "route through the AI proxy", so a connection of any other type holding
  ;; that key would smuggle its requests into managed billing and usage accounting. Checked against the key that
  ;; will actually be stored, so a value that merely slugs to it cannot slip past.
  (api/check-400 (or (llm.provider/managed-type? type)
                     (not= llm.provider/managed-connection-key conn-key))
                 (tru "The {0} connection key is reserved for the Metabase AI service."
                      (pr-str llm.provider/managed-connection-key))))

(defn- without-blank-values
  "Drop `config` entries whose value is blank. The form clears a field it hid by sending an empty string — switching
  Google's authentication method blanks the credential the other method used — and a blank left in the stored config
  would read as present to everything that checks with `some?` rather than `non-blank`."
  [config]
  (into {} (remove (fn [[_ v]] (str/blank? v))) config))

(defn- verify-credentials!
  "Confirm `config` can actually reach `conn`'s provider before anything is persisted, by listing its models — and,
  for a type that probes more than its credentials, by exercising the model it will run on. Throws a 400 carrying
  the provider's own message when the credentials are rejected.

  Returns the model listing and `:learned-config`: whatever the probe determined about the connection, for the
  caller to store on it. A probe records the model it exercised as `:probed-model`."
  [conn config model]
  (when-not (llm.provider/managed-type? (:type conn))
    (let [{:keys [error] :as listed} (list-connection-models* conn config model true)]
      (when error
        (throw (ex-info error {:status-code 400 :api-error true})))
      listed)))

(defn- seed-models-cache!
  "Cache the listing that verified `conn` under its post-save config and selected model. Call this only after any
  save-triggered repointing, so the model refetch the client fires right after saving uses the same cache key."
  [conn listed]
  (when listed
    (swap! models-cache cache/miss (models-cache-key conn) (select-keys listed [:models]))))

(defn- connection-model-ref
  "The `connection-key/model` reference that points Metabot at `conn`: the model the connection's own config names
  (Azure's deployment) when it has one, and the type's default model otherwise. Nil when the type neither names nor
  defaults to a model."
  [{conn-key :key :keys [type config]}]
  (when-let [model (or (llm.provider/connection-model type (llm.provider/with-field-defaults type config))
                       (llm.provider/default-model type))]
    (str conn-key "/" model)))

(defn- fallback-model-ref
  "A model reference to fall back to once the connection Metabot was pointed at is gone: the first remaining
  connection that names a model, or nil to leave Metabot unconfigured."
  []
  (some connection-model-ref (llm.provider/connections)))

(defenterprise cancel-managed-ai-subscription!
  "Cancel the Metabase Cloud add-on that backs the Metabase-managed provider, called when its connection is
  removed. OSS instances have no subscription to cancel."
  metabase-enterprise.metabot.provider
  []
  nil)

(defn- repoint!
  "Write `model-ref` as `setting-key` — unless an env var pins that setting, in which case the write would land in
  the app DB and lose to the env var on every read, leaving the UI claiming a selection the instance is not
  actually using."
  [setting-key model-ref]
  (if (setting/env-var-value setting-key)
    (log/warnf "Leaving %s alone: %s is set by the environment"
               (name setting-key) (setting/env-var-name setting-key))
    (setting/set! setting-key model-ref)))

(defn- repoint-metabot!
  [model-ref]
  (repoint! :llm-metabot-provider model-ref))

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
  [{conn-key :key :as conn} requested-model]
  (when-let [model-ref (if (not-empty requested-model)
                         (str conn-key "/" requested-model)
                         (connection-model-ref conn))]
    (repoint-metabot! model-ref)))

(defn- follow-edited-connection-model!
  "Keep the model-reference settings on the model an edited connection actually serves.

  A model reference stores the model as a string rather than as a live lookup, so for a type whose model comes from
  its own config — Azure, whose reference bakes in `{family}/{deployment-name}` — editing the connection can leave
  a selection naming a deployment that no longer exists. The connection still reports usable, and the next
  request fails at the provider. For a type with a fixed catalog the model in the edit form is a pick, not a
  probe input: when the selection points at this connection, the pick follows through to it.

  An explicitly pinned mini model moves with a composed model the same way — its reference goes just as stale —
  but not with a pick, which changes what the admin prefers rather than what the connection can serve. A derived
  mini model needs no help, since it follows the Metabot selection on its own."
  [{conn-key :key :keys [type config] :as conn} requested-model]
  (let [composed-ref (when (llm.provider/connection-model type (llm.provider/with-field-defaults type config))
                       (connection-model-ref conn))
        picked-ref   (when (and (not-empty requested-model) (seq (llm.provider/fixed-models type)))
                       (str conn-key "/" requested-model))
        metabot-ref  (metabot.settings/llm-metabot-provider)
        mini-ref     (metabot.settings/explicit-mini-model)]
    (when-let [model-ref (or composed-ref picked-ref)]
      (when (and (= conn-key (llm.provider/model-ref->connection-key metabot-ref))
                 (not= model-ref metabot-ref))
        (repoint-metabot! model-ref)))
    (when (and composed-ref
               (= conn-key (llm.provider/model-ref->connection-key mini-ref))
               (not= composed-ref mini-ref))
      (repoint! :llm-mini-model composed-ref))))

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
  (refresh-settings!)
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
  (refresh-settings!)
  (check-connections-not-env-managed!)
  (let [provider-type (llm.provider/provider-type type)]
    (api/check-400 provider-type (tru "Unknown provider type {0}." (pr-str type)))
    (api/check-400 (llm.provider/type-available? type)
                   (tru "The {0} provider is not available on this instance." (pr-str type)))
    (let [config (without-blank-values config)
          conn   {:key    (new-connection-key type key)
                  :type   type
                  :name   (or (not-empty name) (str (:label provider-type)))
                  :config config}]
      (check-can-create-connection! type (:key conn))
      (llm.provider/validate-config! type config)
      ;; The probe is a network round trip to the provider, with retries, and it depends on nothing in the stored
      ;; list beyond the key we would file the connection under, so it runs before the lock rather than holding an
      ;; app-DB transaction open for its duration.
      (let [{:keys [learned-config] :as listed} (verify-credentials! conn config model)]
        (llm.provider/with-connection-write-lock
          ;; The key is recomputed and the checks re-run against a list no sibling can be mid-write on. A sibling
          ;; that took this key in the meantime pushes us onto the next suffix instead of overwriting it.
          (let [conn-key (new-connection-key type key)
                conn     (-> conn
                             (assoc :key conn-key)
                             (update :config merge learned-config))]
            (check-can-create-connection! type conn-key)
            (let [had-usable-model? (metabot-has-a-usable-model?)]
              (llm.provider/set-connections! (conj (llm.provider/stored-connections) conn))
              (when-not had-usable-model?
                ;; a type with no default model — vLLM, which serves whatever the operator loaded — starts on the
                ;; model the probe exercised, so connecting one leaves the instance working rather than model-less
                (select-model-for-new-connection! conn (or model (:probed-model learned-config))))
              (seed-models-cache! conn listed)
              (connection-response (assoc conn :source :db)))))))))

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
  (refresh-settings!)
  (check-connections-not-env-managed!)
  (let [stored     (llm.provider/stored-connections)
        idx        (llm.provider/stored-connection-index stored conn-key)
        _          (api/check-404 idx)
        existing   (nth stored idx)
        live       (llm.provider/connection conn-key)
        _          (check-not-env-connection! live)
        ;; fields the environment owns are not the client's to edit — the form disables them, and what it echoes
        ;; back for them is the mask of the env value, which must not end up stored
        env-config (select-keys (:config live) (:env-fields live))
        merged     (cond-> existing
                     (some? config)     (assoc :config (without-blank-values
                                                        (llm.provider/merge-config
                                                         (:type existing)
                                                         (:config existing)
                                                         (apply dissoc config (:env-fields live)))))
                     (not-empty name)   (assoc :name name))
        ;; what the connection will actually run on: the stored config with the environment layered back over it
        effective  (merge (:config merged) env-config)]
    (llm.provider/validate-config! (:type merged) effective)
    ;; probed before the lock, for the reason given in the create endpoint
    (let [{:keys [learned-config] :as listed}
          (verify-credentials! merged effective (or model (selected-model conn-key)))
          merged                   (update merged :config merge learned-config)
          effective                (merge effective learned-config)]
      (llm.provider/with-connection-write-lock
        ;; The row is located again in a freshly read list. `merged` is still built from the read above — two
        ;; edits of the *same* connection are a last-write-wins the admin can see — but writing back that read's
        ;; list would silently drop a connection a sibling instance added or edited since.
        (let [stored (llm.provider/stored-connections)
              idx    (llm.provider/stored-connection-index stored conn-key)]
          (api/check-404 idx)
          (llm.provider/set-connections! (assoc stored idx merged))
          (follow-edited-connection-model! (assoc merged :config effective) model)
          (seed-models-cache! (assoc merged :config effective) listed)
          (connection-response (assoc (merge live merged) :config effective)))))))

(api.macros/defendpoint :delete "/providers/:key" :- :nil
  "Delete a provider connection."
  [{conn-key :key} :- [:map [:key connection-key-schema]]]
  (perms/check-has-application-permission :setting)
  (refresh-settings!)
  (check-connections-not-env-managed!)
  (let [conn (llm.provider/connection conn-key)]
    (api/check-404 conn)
    (check-not-env-connection! conn)
    (when (llm.provider/managed-type? (:type conn))
      ;; removing the managed connection cancels the Store subscription behind it, and everything else that can
      ;; cancel add-ons is superuser-only — settings access must not be enough to end a paid contract
      (api/check-superuser)
      ;; a call out to the Store, so it stays outside the lock
      (cancel-managed-ai-subscription!))
    (llm.provider/with-connection-write-lock
      (let [remaining (vec (remove #(= (:key %) conn-key) (llm.provider/stored-connections)))]
        (llm.provider/set-connections! remaining)
        (when (= conn-key (llm.provider/model-ref->connection-key (metabot.settings/explicit-mini-model)))
          (setting/set! :llm-mini-model nil))
        (when (= conn-key (llm.provider/model-ref->connection-key (metabot.settings/llm-metabot-provider)))
          (repoint-metabot! (fallback-model-ref))))))
  nil)

(api.macros/defendpoint :get "/models"
  :- models-response-schema
  "List the models available from every configured connection, grouped by connection.

  A connection whose credentials are rejected comes back with an empty model list and an `error`, so one bad
  connection does not blank out the others."
  []
  (perms/check-has-application-permission :setting)
  (refresh-settings!)
  (into []
        (pmap connection-models-response (llm.provider/connections))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` provider routes."
  (api.macros/ns-handler *ns*))
