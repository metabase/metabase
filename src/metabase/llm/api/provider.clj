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
   [metabase.llm.health :as llm.health]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.catalog :as catalog]
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

(def ^:private connection-failure-response-schema
  [:map
   [:message :string]
   ;; Whether retrying is pointless until the connection is changed — a rejected key rather than an outage.
   [:fatal :boolean]])

(def ^:private connection-response-schema
  [:map
   [:key :string]
   [:type :string]
   [:name :string]
   [:source [:enum "db" "env"]]
   [:usable :boolean]
   [:reorderable :boolean]
   [:error [:maybe connection-failure-response-schema]]
   [:env_vars [:sequential :string]]
   [:env_fields [:sequential :string]]
   [:config [:map-of :keyword [:maybe :string]]]])

(def ^:private active-model-schema
  [:map
   [:model_ref [:maybe :string]]
   [:model [:maybe :string]]
   [:model_name [:maybe :string]]
   [:connection_key [:maybe :string]]
   [:connection_name [:maybe :string]]
   [:selected_model_ref [:maybe :string]]
   [:is_fallback :boolean]])

(def ^:private active-model-response-schema
  [:map
   [:default active-model-schema]
   [:mini active-model-schema]])

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

(defn- connection-reorderable?
  "Whether this connection's position in the fallback order can be changed. Only connections stored
  in `llm-providers` can move: ones synthesized from the single-provider environment variables are appended to
  whatever is stored, and the whole list is read-only when `llm-providers` itself comes from the environment."
  [conn-key]
  (and (nil? (setting/env-var-value :llm-providers))
       (boolean (some #(= conn-key (:key %)) (llm.provider/stored-connections)))))

(defn- connection-failure-response
  [conn-key]
  (when-let [{:keys [message fatal?]} (llm.health/failure conn-key)]
    {:message message :fatal fatal?}))

(defn- connection-response
  [{conn-key :key conn-name :name :keys [type source config env-vars env-fields] :as conn}]
  {:key         conn-key
   :type        type
   :name        conn-name
   :source      (name (or source :db))
   :usable      (llm.provider/config-complete? type config)
   :reorderable (connection-reorderable? conn-key)
   :error       (connection-failure-response conn-key)
   :env_vars    (vec env-vars)
   ;; the config keys the environment owns; the form disables exactly these inputs
   :env_fields  (mapv name env-fields)
   :config      (or (:config (llm.provider/redact conn)) {})})

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

(defn- record-listing-failure!
  "Report a failed model listing to [[metabase.llm.health]] so it outlives the response — the provider list shows
  it, and the fallback skips the connection until it clears. Returns `result`.

  A listing that works records nothing. It is not proof the connection can serve requests: Anthropic answers
  `GET /v1/models` for an account whose balance is empty, so a clean listing must not wipe what inference found.
  Only an inference that succeeds clears a failure, or the timeout on a transient one.

  Called on the way into the cache rather than on every read, so an error being served from the cache does not keep
  pushing back the moment a transient failure expires. Only the managed type is left out: it is answered from the
  registry without a request, so it proves nothing about the connection. Google's catalog is fixed too, but its
  listing still verifies the credentials against the provider, so what it finds counts."
  [{conn-key :key :keys [type]} {:keys [error transient?] :as result}]
  (when (and error (not (llm.provider/managed-type? type)))
    (llm.health/record-failure! conn-key error (not transient?)))
  result)

(defn- connection-models-response
  "List `conn`'s models for the client, reporting a failure to [[metabase.llm.health]]."
  [{conn-key :key conn-name :name :keys [type] :as conn}]
  (merge {:key conn-key :name conn-name :type type}
         (dissoc
          (try
            (cache.wrapped/lookup-or-miss models-cache (models-cache-key conn)
                                          (fn [_] (record-listing-failure! conn (list-connection-models* conn nil nil false))))
            (catch Exception e
              (log/warn e "Failed to list models for LLM provider connection" {:connection conn-key})
              ;; Not a rejection from the provider — a request that never got an answer, which a later one still
              ;; might, so it is not cached and not held against the connection permanently.
              (record-listing-failure! conn {:models [] :error (.getMessage e) :transient? true})))
          :transient?)))

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

  Costs the one query that reads `settings-last-updated`, unless something has actually changed."
  []
  (setting/restore-cache-if-needed! :force-check? true))

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

(defn- fallback-model-ref
  "A model reference to fall back to once the connection Metabot was pointed at is gone: the first remaining
  connection that names a model, or nil to leave Metabot unconfigured. Unlike the runtime fallback this ignores
  which connections are currently failing — a recorded failure is a reason to route around a connection, not to
  refuse to select it."
  []
  (llm.provider/first-model-ref))

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
                         (llm.provider/connection-model-ref conn))]
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
                       (llm.provider/connection-model-ref conn))
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
    (api/check-400 (not (and (llm.provider/singleton-type? type)
                             (some #(= type (:type %)) (llm.provider/connections))))
                   (tru "The {0} provider is already connected." (pr-str type)))
    (api/check-400 (not (and (llm.provider/managed-type? type)
                             (llm.provider/connection llm.provider/managed-connection-key)))
                   (tru "Another connection holds the {0} key. Remove it before connecting the Metabase AI service."
                        (pr-str llm.provider/managed-connection-key)))
    (let [conn-key (if (llm.provider/managed-type? type)
                     llm.provider/managed-connection-key
                     (llm.provider/unique-key (or (not-empty key) type)))
          ;; the `metabase/` model-ref prefix means "route through the AI proxy", so a connection of any other
          ;; type holding that key would smuggle its requests into managed billing and usage accounting. Checked
          ;; against the key that will actually be stored, so a value that merely slugs to it cannot slip past.
          _        (api/check-400 (or (llm.provider/managed-type? type)
                                      (not= llm.provider/managed-connection-key conn-key))
                                  (tru "The {0} connection key is reserved for the Metabase AI service."
                                       (pr-str llm.provider/managed-connection-key)))
          config   (without-blank-values config)
          conn     {:key    conn-key
                    :type   type
                    :name   (or (not-empty name) (str (:label provider-type)))
                    :config config}]
      (llm.provider/validate-config! type config)
      (let [{:keys [learned-config] :as listed} (verify-credentials! conn config model)
            conn              (update conn :config merge learned-config)
            had-usable-model? (metabot-has-a-usable-model?)]
        (llm.provider/set-connections! (conj (llm.provider/stored-connections) conn))
        (when-not had-usable-model?
          ;; a type with no default model — vLLM, which serves whatever the operator loaded — starts on the model
          ;; the probe exercised, so connecting one leaves the instance working rather than model-less
          (select-model-for-new-connection! conn (or model (:probed-model learned-config))))
        (seed-models-cache! conn listed)
        (connection-response (assoc conn :source :db))))))

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
        idx        (first (keep-indexed (fn [i c] (when (= (:key c) conn-key) i)) stored))
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
    (let [{:keys [learned-config] :as listed}
          (verify-credentials! merged effective (or model (selected-model conn-key)))
          merged                   (update merged :config merge learned-config)
          effective                (merge effective learned-config)]
      (llm.provider/set-connections! (assoc stored idx merged))
      (follow-edited-connection-model! (assoc merged :config effective) model)
      (seed-models-cache! (assoc merged :config effective) listed)
      (connection-response (assoc (merge live merged) :config effective)))))

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
      (cancel-managed-ai-subscription!))
    (let [remaining (vec (remove #(= (:key %) conn-key) (llm.provider/stored-connections)))]
      (llm.provider/set-connections! remaining)
      (when (= conn-key (llm.provider/model-ref->connection-key (metabot.settings/explicit-mini-model)))
        (setting/set! :llm-mini-model nil))
      (when (= conn-key (llm.provider/model-ref->connection-key (metabot.settings/llm-metabot-provider)))
        (repoint-metabot! (fallback-model-ref)))))
  nil)

(api.macros/defendpoint :put "/provider-order"
  :- [:sequential connection-response-schema]
  "Set the order the provider connections are listed and fallen back to in.

  `order` is the full list of connection keys, top first. Keys that name a connection configured by the
  single-provider environment variables are ignored: those are appended after the stored ones on every read, so
  there is no position to save for them."
  [_route-params
   _query-params
   {:keys [order]} :- [:map [:order [:sequential connection-key-schema]]]]
  (perms/check-has-application-permission :setting)
  (check-connections-not-env-managed!)
  (let [stored    (llm.provider/stored-connections)
        by-key    (into {} (map (juxt :key identity)) stored)
        requested (filterv by-key order)]
    (api/check-400 (= (frequencies requested) (frequencies (map :key stored)))
                   (tru "The order must list every stored provider connection exactly once."))
    (llm.provider/set-connections! (mapv by-key requested))
    (mapv connection-response (llm.provider/connections))))

(defn- active-model-response
  [{:keys [model-ref selected-model-ref fallback]}]
  (let [conn-key (llm.provider/model-ref->connection-key model-ref)]
    {:model_ref          model-ref
     :model              (llm.provider/model-ref->model model-ref)
     :model_name         (catalog/model-name model-ref)
     :connection_key     conn-key
     :connection_name    (:name (llm.provider/connection conn-key))
     :selected_model_ref selected-model-ref
     :is_fallback        (some? fallback)}))

(api.macros/defendpoint :get "/active-model"
  :- active-model-response-schema
  "The models the AI features are running on right now, and the ones they are configured to run on — `default` for
  Metabot itself, `mini` for quick background tasks.

  A use case's `model_ref` differs from its `selected_model_ref` when the selected connection cannot serve requests
  and `llm-provider-fallback-enabled?` moved it to the next connection in the list; `is_fallback` says whether that
  has happened."
  []
  (perms/check-has-application-permission :setting)
  {:default (active-model-response (metabot.settings/metabot-model-selection))
   :mini    (active-model-response (metabot.settings/mini-model-selection))})

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
