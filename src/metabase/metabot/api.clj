(ns metabase.metabot.api
  "`/api/metabot/` routes"
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.api.conversations]
   [metabase.metabot.api.document]
   [metabase.metabot.api.metabot]
   [metabase.metabot.api.permissions]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.envelope :as metabot.envelope]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as sr]
   [metabase.settings.core :as setting]
   [metabase.slackbot.api]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)))

(set! *warn-on-reflection* true)

(defn- check-conversation-access!
  "Throw a 403 if a `MetabotConversation` with `conversation-id` already exists and
  the current user is not a participant (has not sent at least one message in it).
  New conversations (no row yet) are allowed so the first store-messages! call
  can originate one. Permissions are participation-based — a conversation can
  have multiple participants (e.g. multiple users in a shared Slack thread)."
  [conversation-id]
  (when-let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
    (api/check-403 (mi/can-read? conversation))))

(defn- streaming-writer-rf
  "Creates a reducing function that writes AI SDK lines to an OutputStream.

  Lines are written immediately with a newline and flushed for real-time streaming.
  When `canceled-chan` is provided, polls it before each write and returns `reduced`
  to stop the pipeline when the client has disconnected. Also catches EofException
  (client closed connection) and converts it to `reduced` so the pipeline shuts down
  cleanly without triggering upstream retries.

  `canceled?` is a `volatile!` flipped to `true` when the writer detects a
  disconnect or canceled-chan signal to mark the assistant turn as `finished=false`."
  [^java.io.OutputStream os canceled-chan canceled?]
  (fn
    ([] nil)
    ([_] nil)
    ([acc ^String line]
     (if (and canceled-chan (a/poll! canceled-chan))
       (do (vreset! canceled? true)
           (reduced acc))
       (try
         (.write os (.getBytes (str line "\n") "UTF-8"))
         (.flush os)
         (catch org.eclipse.jetty.io.EofException _
           (vreset! canceled? true)
           (reduced acc)))))))

(defn- native-agent-streaming-request
  "Handle streaming request using native Clojure agent.

  Streams AI SDK v4 line protocol to the client in real-time while simultaneously
  collecting parts for database storage. Text parts are combined before storage
  to consolidate streaming chunks into single text parts.

  Monitors `canceled-chan` for client disconnection — when the client closes the
  connection, the pipeline stops via `reduced` and collected parts are still persisted.

  When `:debug?` is true, enables debug logging which emits a `debug_log` data
  part at the end of the stream with full LLM request/response data per iteration.

  `:assistant-msg-id` is the PK of the placeholder assistant row created by
  [[metabot.persistence/start-turn!]]; the finally block UPDATEs that row.
  `:external-id` is the assistant row's `external_id`, threaded into the AI-SDK
  line protocol so the client can correlate streamed messages with feedback."
  [{:keys [metabot-id profile-id message context history conversation-id state debug?
           assistant-msg-id external-id]}]
  (let [enriched-context (metabot.context/create-context context {:metabot-id metabot-id})
        messages         (concat history [message])]
    (sr/streaming-response {:content-type "text/event-stream"} [^OutputStream os canceled-chan]
      (let [parts-atom (atom [])
            canceled?  (volatile! false)
            ;; Captures throwables that escape the agent loop's own `catch Exception`
            ;; (e.g. setup-phase throws before the reducible is constructed, `Error`
            ;; subclasses, or failures from the agent's recovery `rf` write). Without
            ;; this, such turns finalize as `:finished true :error nil` — indistinguishable
            ;; from a clean success.
            thrown     (volatile! nil)
            ;; In dev mode, emit usage parts in the SSE stream for debugging/benchmarking.
            xf         (comp (u/tee-xf parts-atom)
                             (self.core/aisdk-line-xf {:emit-usage? config/is-dev?
                                                       :external-id external-id}))]
        (try
          (transduce xf
                     (streaming-writer-rf os canceled-chan canceled?)
                     (agent/run-agent-loop
                      (cond-> {:messages      messages
                               :state         state
                               :metabot-id    metabot-id
                               :profile-id    (keyword profile-id)
                               :context       enriched-context
                               :tracking-opts {:session-id conversation-id}}
                        debug? (assoc :debug? true))))
          (catch org.eclipse.jetty.io.EofException _
            (vreset! canceled? true)
            (log/debug "Client disconnected during native agent streaming"))
          (catch Throwable t
            ;; `Throwable` (not `Exception`) so `Error` subclasses (OOM, etc.) still
            ;; get captured into the row before they propagate. Don't re-throw: the
            ;; HTTP 202 has already been committed and `streaming-response` will close
            ;; the socket cleanly when this body fn returns. The error is fully
            ;; captured in the row via the `finally` below and in the log here.
            (vreset! thrown t)
            (log/error t "Native agent stream failed"
                       {:conversation-id conversation-id
                        :assistant-msg-id assistant-msg-id
                        :external-id     external-id})
            ;; Stream a well-formed AI SDK error part so the client surfaces the failure
            ;; instead of treating the truncated stream as a silent success. Unlike binary
            ;; downloads (which abort the connection), an event stream carries its own error
            ;; framing, so we emit the error event and then let the body fn return to close
            ;; the socket cleanly — aborting here would deny the client this very event.
            (try
              (let [error-line (self.core/format-error-line
                                {:error (metabot.persistence/throwable->error-payload t)})]
                (.write os (.getBytes (str error-line "\n") "UTF-8"))
                (.flush os))
              (catch org.eclipse.jetty.io.EofException _
                (vreset! canceled? true))))
          (finally
            (try
              (let [combined-parts (into [] (metabot.persistence/combine-text-parts-xf) @parts-atom)
                    aborted?       @canceled?
                    thrown-ex      @thrown
                    ;; Precedence: aborted > thrown > streamed `:error`.
                    ;;   - aborted: client is gone, no point recording why — they can't see it.
                    ;;   - thrown:  more authoritative than any partial streamed error.
                    ;;   - streamed: today's behavior for adapter/tool errors.
                    error-data     (cond
                                     aborted? nil
                                     thrown-ex (metabot.persistence/throwable->error-payload thrown-ex)
                                     :else (:error (u/seek #(= :error (:type %)) combined-parts)))]
                (metabot.persistence/finalize-assistant-turn!
                 conversation-id assistant-msg-id combined-parts
                 :profile-id profile-id
                 :finished?  (not aborted?)
                 :error      error-data))
              (catch Exception e
                (log/error e "Failed to finalize assistant turn"
                           {:conversation-id  conversation-id
                            :assistant-msg-id assistant-msg-id
                            :external-id      external-id})))))))))

(defn streaming-request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc.

  `request-info` is a map of `{:origin :referer :user-agent :ip-address}`. We split
  it into:
    - `hostname`: extracted from the origin URL, always recorded.
    - `pii-info`: gated by `analytics-pii-retention-enabled` — nil when off."
  [{:keys [metabot_id profile_id message context history conversation_id state debug]} request-info]
  (let [message    (metabot.envelope/user-message message)
        metabot-id (metabot.config/resolve-dynamic-metabot-id metabot_id)
        _          (metabot.config/check-metabot-enabled! metabot-id)
        _          (metabot.usage/check-metabase-managed-free-limit!)
        profile-id (metabot.config/resolve-dynamic-profile-id profile_id metabot-id)
        ;; Only allow debug mode in dev — never in production
        debug?     (and config/is-dev? (boolean debug))
        hostname   (analytics.core/extract-hostname (:origin request-info))
        pii-info   (analytics.core/pii-fields-from request-info)]
    (check-conversation-access! conversation_id)
    (let [{:keys [assistant-msg-id assistant-external-id]}
          (metabot.persistence/start-turn! conversation_id profile-id message
                                           :hostname hostname
                                           :pii-info pii-info)]
      (log/info "Using native Clojure agent" {:profile-id profile-id :debug? debug?})
      (native-agent-streaming-request
       {:metabot-id       metabot-id
        :profile-id       profile-id
        :message          message
        :context          context
        :history          history
        :conversation-id  conversation_id
        :state            state
        :debug?           debug?
        :assistant-msg-id assistant-msg-id
        :external-id      assistant-external-id}))))

(defn- legacy->modern-query
  [query]
  (if-not (= :mbql-version/legacy (lib/normalized-mbql-version query))
    query
    (lib/query
     (lib-be/application-database-metadata-provider (:database query))
     query)))

(def upgradable-item-types
  "User is viewing item types with query and chart configs. Upgradeable by [[upgrade-viewing-queries]]."
  metabot.context/item-types-qc)

(mu/defn- upgrade-viewing-queries
  "Update queries of items in viewing context vector. Handles following item types: adhoc, question, model, metric"
  [viewing :- [:vector metabot.context/ViewingItemSchema]]
  (letfn [(update-items-query [item] (m/update-existing item :query legacy->modern-query))
          (maybe-update-item [item] (cond-> item
                                      (contains? upgradable-item-types (:type item))
                                      (-> update-items-query
                                          (m/update-existing :chart_configs (partial mapv update-items-query)))))]
    (mapv maybe-update-item viewing)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/agent-streaming"
  "Send a chat message to the LLM via the AI Proxy."
  [_route-params
   _query-params
   body :- [:map
            [:profile_id {:optional true} :string]
            [:metabot_id {:optional true} :string]
            [:message ms/NonBlankString]
            [:context ::metabot.context/context]
            [:conversation_id ms/UUIDString]
            [:history [:maybe ::metabot.schema/messages]]
            [:state [:map
                     [:queries {:optional true} [:map-of :string :any]]
                     [:charts {:optional true} [:map-of :string :any]]
                     [:chart-configs {:optional true} [:map-of :string :any]]]]
            [:debug {:optional true} [:maybe :boolean]]]
   req]
  (metabot.context/log body :llm.log/fe->be)
  (let [body*          (m/update-existing body [:context :user_is_viewing] upgrade-viewing-queries)
        embed-referrer (get-in req [:headers "x-metabase-embed-referrer"])
        request-info   {:origin     embed-referrer
                        :referer    embed-referrer
                        :user-agent (get-in req [:headers "user-agent"])
                        :ip-address (request/ip-address req)}]
    (streaming-request body* request-info)))

(api.macros/defendpoint :post "/feedback"  :- [:map
                                               [:status [:= 204]]
                                               [:body :nil]]
  "Persist Metabot feedback."
  [_route-params
   _query-params
   body :- [:map
            [:metabot_id        ms/PositiveInt]
            [:message_id        ms/NonBlankString]
            [:positive          :boolean]
            [:issue_type        {:optional true} [:maybe :string]]
            [:freeform_feedback {:optional true} [:maybe :string]]]]
  (metabot.config/check-metabot-enabled!)
  (let [message (metabot.feedback/persist-feedback! body)]
    (try
      (api/check-400 (metabot.feedback/submit-to-harbormaster!
                      (metabot.feedback/harbormaster-payload body message))
                     "Cannot submit feedback. The license token and/or Store API URL are missing!")
      (catch Exception e
        (log/error "Failed to submit feedback to Harbormaster: " (ex-message e)))))
  api/generic-204-no-content)

(api.macros/defendpoint :post "/source-feedback" :- [:map
                                                     [:status [:= 204]]
                                                     [:body :nil]]
  "Persist Metabot source feedback."
  [_route-params
   _query-params
   body :- [:map
            [:metabot_id   ms/PositiveInt]
            [:message_id   ms/NonBlankString]
            [:source_id    ms/PositiveInt]
            [:source_type  [:enum "table" "card" "model"]]
            [:positive     :boolean]]]
  (metabot.config/check-metabot-enabled!)
  (metabot.feedback/persist-source-feedback! body)
  api/generic-204-no-content)

(def ^:private metabot-provider-schema
  (into [:enum] metabot.settings/supported-metabot-providers))

(def ^:private llm-model-response-schema
  [:map
   [:id :string]
   [:display_name :string]
   [:group {:optional true} [:maybe :string]]])

(def ^:private metabot-settings-response-schema
  [:map
   [:value [:maybe :string]]
   [:credentials-error {:optional true} [:maybe :string]]
   [:models [:sequential llm-model-response-schema]]])

(def ^:private provider-credentials-schema
  "Provider credentials carried by the request body's `:credentials` map.
  Bedrock sends AWS key material; Azure sends an API key and base URL."
  [:map
   [:access-key-id     {:optional true} [:maybe :string]]
   [:secret-access-key {:optional true} [:maybe :string]]
   [:region            {:optional true} [:maybe :string]]
   [:session-token     {:optional true} [:maybe :string]]
   [:api-key           {:optional true} [:maybe :string]]
   [:base-url          {:optional true} [:maybe :string]]])

(def ^:private metabot-settings-request-schema
  [:map
   [:provider metabot-provider-schema]
   [:model {:optional true} [:maybe :string]]
   [:api-key {:optional true} [:maybe :string]]
   [:credentials {:optional true} [:maybe provider-credentials-schema]]])

(defn- provider-api-key-setting-key
  [provider]
  (case provider
    "anthropic"  :llm-anthropic-api-key
    "openai"     :llm-openai-api-key
    "openrouter" :llm-openrouter-api-key))

(defn- non-blank-string
  [value]
  (when (string? value)
    (let [trimmed (str/trim value)]
      (when-not (str/blank? trimmed)
        trimmed))))

(defn- effective-provider-model
  [provider model]
  (when (some? model)
    (or (non-blank-string model)
        (metabot.settings/default-model-for-provider provider))))

(defn- provider-client-error?
  "Whether a provider api-error is a client-side 4xx we should surface rather than treat as an
  outage. Covers rejected or missing credentials (401/403) and a request the provider refused
  outright (e.g. a custom base URL pointing at the wrong surface, which 400s). `rethrow-api-error!`
  tags these with `:status`; other callers throw with `:status-code`. Provider 5xx and network
  failures are left to propagate as 500s so outages aren't reported as client errors."
  [error]
  (let [{:keys [api-error status status-code]} (ex-data error)
        status (or status status-code)]
    (and api-error
         (number? status)
         (<= 400 status 499))))

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

(defn- openrouter-model-group
  [{:keys [display_name id]}]
  (or (some-> display_name
              (str/split #": " 2)
              first)
      (some-> id
              (str/split #"/" 2)
              first
              title-case-token)))

(defn- decorate-provider-model
  [provider model]
  (case provider
    "anthropic"  (assoc model :group (anthropic-model-group model))
    "bedrock"    (assoc model :group (bedrock-model-group model))
    "openrouter" (assoc model :group (openrouter-model-group model))
    model))

(defn- normalize-metabase-model
  [model]
  (update model :id (fn [id]
                      (when id
                        (if (str/includes? id "/")
                          id
                          (str "anthropic/" id))))))

(defn- decorate-provider-models
  [provider models]
  (let [models           (if (= provider provider-util/metabase-provider-prefix)
                           (map normalize-metabase-model models)
                           models)
        decorated-models (map #(decorate-provider-model provider %) models)]
    (if (contains? #{"anthropic" "bedrock" "openrouter"} provider)
      (let [grouped-models (group-by :group decorated-models)]
        (->> grouped-models
             keys
             sort
             (mapcat #(get grouped-models %))
             vec))
      (vec decorated-models))))

(defn- provider-models-response
  "List a provider's models.
  Validate against `:credentials` in `opts` when provided and the provider's saved credentials otherwise. The shape
  of the credentials map varies by provider (see [[metabot.settings/configured-provider-credentials]]). `:model` in
  `opts` is the candidate model for providers whose validation depends on it (Azure's wire family)."
  ([provider]
   (provider-models-response provider nil))
  ([provider {credentials-override :credentials model :model}]
   (if (= provider provider-util/metabase-provider-prefix)
     {:models (decorate-provider-models
               provider
               (:models (metabot.self/list-models "anthropic" {:ai-proxy? true})))}
     (let [credentials (or credentials-override
                           (metabot.settings/configured-provider-credentials provider))]
       (if (and provider (metabot.settings/provider-credentials-complete? provider credentials))
         (try
           {:models (decorate-provider-models
                     provider
                     (:models (metabot.self/list-models provider (cond-> {:credentials credentials}
                                                                   model (assoc :model model)))))}
           (catch clojure.lang.ExceptionInfo e
             (if (provider-client-error? e)
               {:models []
                :credentials-error (.getMessage e)}
               (throw e))))
         {:models []})))))

(defn- settings-response
  ([provider]
   (settings-response provider nil))
  ([provider opts]
   (merge
    {:value (metabot.settings/llm-metabot-provider)}
    (provider-models-response provider opts))))

(defn- current-provider
  []
  (provider-util/provider-and-model->provider (metabot.settings/llm-metabot-provider)))

(defn- current-setting-provider
  []
  (provider-util/provider-and-model->outer-provider (metabot.settings/llm-metabot-provider)))

(defn- throw-credentials-error!
  [response]
  (when-let [credentials-error (:credentials-error response)]
    (throw (ex-info credentials-error
                    {:status-code 400
                     :api-error true})))
  response)

(api.macros/defendpoint :get "/settings"
  :- metabot-settings-response-schema
  "Return available models for a provider using its configured credentials."
  [_route-params
   {:keys [provider]} :- [:map
                          [:provider {:optional true} metabot-provider-schema]]]
  (perms/check-has-application-permission :setting)
  (settings-response (or provider (current-provider))))

(def ^:private bedrock-credential-fields
  [:access-key-id :secret-access-key :region :session-token])

(defn- effective-bedrock-credentials
  "The Bedrock credentials a settings request resolves to.

  Each field follows the same presence contract as the top-level `:credentials` key: a field present in the request
  replaces the saved `llm-bedrock-*` value, while an absent field keeps the saved value. Nil or blank means an
  explicit clear. So an admin can blank a stale session token without re-entering the keys, and a region-only edit
  doesn't touch anything else."
  [supplied-creds]
  (reduce (fn [creds field]
            (cond-> creds
              (contains? supplied-creds field) (assoc field (non-blank-string (get supplied-creds field)))))
          (metabot.settings/configured-provider-credentials "bedrock")
          bedrock-credential-fields))

(defn- effective-azure-credentials
  "The Azure credentials a settings request resolves to.

  Non-blank request fields are layered over the saved `llm-azure-*` settings, so e.g. a key-only rotation keeps the
  saved base URL. The settings are read individually (not via the all-or-nothing configured-credentials map) so a
  partially-configured or env-set field still participates in layering — completeness is the caller's check. The
  base URL is normalized the same way its setter normalizes it (whitespace/trailing-slash trim) so the validation
  round-trip exercises exactly what would be persisted."
  [{:keys [api-key base-url]}]
  {:api-key  (or (non-blank-string api-key)
                 (non-blank-string (llm.settings/llm-azure-api-key)))
   :base-url (or (llm.settings/normalize-llm-base-url base-url)
                 (llm.settings/normalize-llm-base-url (llm.settings/llm-azure-api-base-url)))})

(defn- request-credentials
  "The credentials override carried by a `PUT /api/metabot/settings` request body as a provider credentials map.

  nil when the request does not touch credentials for `provider`.

  An explicitly nil credential field in the body — `:api-key` for API-key providers, `:credentials` for Bedrock and
  Azure — resolves to a credentials map whose key material is nil: an explicit clear. Fields *inside* the Bedrock
  credentials map follow that map's presence contract (see [[effective-bedrock-credentials]]); blank fields *inside*
  the Azure credentials map mean \"keep the saved value\" (see [[effective-azure-credentials]]), so e.g. a key-only
  rotation can't wipe the base URL. Throws a 400 when non-nil Bedrock/Azure credentials don't resolve to a complete
  set."
  [provider {:keys [api-key credentials] :as body}]
  (case provider
    "bedrock"
    (when (contains? body :credentials)
      (if (nil? credentials)
        {:access-key-id     nil
         :secret-access-key nil
         :session-token     nil
         :region            nil}
        (let [creds (effective-bedrock-credentials credentials)]
          (when-not (metabot.settings/provider-credentials-complete? provider creds)
            (throw (ex-info (tru "AWS Bedrock credentials are incomplete.")
                            {:status-code  400
                             :api-error    true
                             :missing-keys (vec (remove #(non-blank-string (get creds %))
                                                        [:access-key-id :secret-access-key]))})))
          creds)))

    "azure"
    (when (contains? body :credentials)
      (if (nil? credentials)
        {:api-key  nil
         :base-url nil}
        (let [creds (effective-azure-credentials credentials)]
          (when-not (metabot.settings/provider-credentials-complete? provider creds)
            (throw (ex-info (tru "Azure credentials are incomplete.")
                            {:status-code  400
                             :api-error    true
                             :missing-keys (vec (remove #(non-blank-string (get creds %))
                                                        [:api-key :base-url]))})))
          creds)))

    (when (contains? body :api-key)
      {:api-key (non-blank-string api-key)})))

(defn- save-bedrock-credentials!
  "Persist a Bedrock credentials map resolved by [[request-credentials]]; nil key material clears those settings.
  The region is written only when the map carries it — a nil region resets the setting to its default. A top-level
  credentials clear (disconnect) carries `:region nil`, so it resets the region too; a field-level edit that omits
  `:region` leaves the saved value in place."
  [{:keys [access-key-id secret-access-key session-token] :as credentials}]
  (setting/set! :llm-bedrock-access-key-id access-key-id)
  (setting/set! :llm-bedrock-secret-access-key secret-access-key)
  (setting/set! :llm-bedrock-session-token session-token)
  (when (contains? credentials :region)
    (setting/set! :llm-bedrock-region (:region credentials))))

(defn- check-not-env-shadowed!
  "Throw a 400 when `setting-key` is controlled by an env var. Writes to env-shadowed settings
  persist to the app DB but the env var wins on every read, so they silently do nothing — reject
  them up front instead."
  [setting-key]
  (when (some? (setting/env-var-value setting-key))
    (throw (ex-info (tru "This setting is set by the {0} environment variable and cannot be changed via the API."
                         (setting/env-var-name setting-key))
                    {:status-code 400
                     :setting     setting-key}))))

(defn- save-azure-credentials!
  "Persist an Azure credentials map resolved by [[request-credentials]]; nil values clear those settings."
  [{:keys [api-key base-url]}]
  (setting/set! :llm-azure-api-key api-key)
  (setting/set! :llm-azure-api-base-url base-url))

(defn- save-credentials!
  "Persist the credentials override resolved by [[request-credentials]]; nil leaves the saved settings untouched."
  [provider credentials]
  (when credentials
    (case provider
      "bedrock" (save-bedrock-credentials! credentials)
      "azure"   (save-azure-credentials! credentials)
      (setting/set! (provider-api-key-setting-key provider) (:api-key credentials)))))

(defn- credential-setting-keys
  "The app-DB settings that persisting `provider`'s resolved `credentials` map would write
  (mirrors [[save-credentials!]]). Used to reject writes to env-shadowed settings up front: a write
  to an env-shadowed setting persists a DB row the env var then silently wins over. Bedrock writes
  `:llm-bedrock-region` only when the credentials carry it (see [[save-bedrock-credentials!]]), so it
  is guarded only then; the other fields are always written."
  [provider credentials]
  (case provider
    "bedrock" (cond-> [:llm-bedrock-access-key-id :llm-bedrock-secret-access-key :llm-bedrock-session-token]
                (contains? credentials :region) (conj :llm-bedrock-region))
    "azure"   [:llm-azure-api-key :llm-azure-api-base-url]
    [(provider-api-key-setting-key provider)]))

(api.macros/defendpoint :put "/settings"
  :- metabot-settings-response-schema
  "Update the Metabot provider credentials and/or model setting and return the refreshed settings payload."
  [_route-params
   _query-params
   body :- metabot-settings-request-schema]
  (perms/check-has-application-permission :setting)
  (let [{:keys [provider] request-model :model} body
        credentials       (request-credentials provider body)
        current-provider  (current-setting-provider)
        provider-changed? (not= current-provider provider)
        model             (cond
                            (non-blank-string request-model)
                            (effective-provider-model provider request-model)

                            provider-changed?
                            (or (effective-provider-model provider request-model)
                                (metabot.settings/default-model-for-provider provider))

                            :else
                            nil)
        ;; Azure has no default model: the FE composes `{family}/{deployment}` from required
        ;; inputs, so a connect (provider switch) without one is a malformed request, and a
        ;; supplied model must parse before the validation round-trip relies on its wire family.
        _                 (when (= provider "azure")
                            (when (and provider-changed? (nil? model))
                              (throw (ex-info (tru "A model provider and deployment name are required to connect Azure.")
                                              {:status-code 400
                                               :api-error   true
                                               :provider    provider})))
                            (when model
                              (metabot.settings/validate-azure-model! (str provider "/" model) model)))
        ;; Reject writes to env-shadowed settings before verifying or persisting anything: guard every
        ;; credential setting a save would touch (see [[credential-setting-keys]]), plus the
        ;; provider/model setting whenever a provider/model write would happen.
        _                 (when credentials
                            (run! check-not-env-shadowed! (credential-setting-keys provider credentials)))
        _                 (when model
                            (check-not-env-shadowed! :llm-metabot-provider))
        ;; Azure connect validation needs the candidate model's wire family; credential-only
        ;; rotations on a connected Azure provider fall back to the saved model.
        validation-model  (when (= provider "azure")
                            (or model
                                (when-not provider-changed?
                                  (provider-util/provider-and-model->model (metabot.settings/llm-metabot-provider)))))
        ;; The model listing validates the request credentials before anything is saved.
        response          (-> (settings-response provider {:credentials credentials
                                                           :model       validation-model})
                              throw-credentials-error!)]
    (when credentials
      (save-credentials! provider credentials))
    (when model
      (setting/set! :llm-metabot-provider (str provider "/" model)))
    (assoc response :value (metabot.settings/llm-metabot-provider))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot` routes."
  (handlers/routes
   (handlers/route-map-handler
    {"/metabot"       metabase.metabot.api.metabot/routes
     "/conversations" metabase.metabot.api.conversations/routes
     "/permissions"   metabase.metabot.api.permissions/routes
     "/document"      metabase.metabot.api.document/routes
     ;; premium check happens in the route so we still ack events to prevent slack retrying
     "/slack"         metabase.slackbot.api/routes})
   (api.macros/ns-handler *ns* +auth)))
