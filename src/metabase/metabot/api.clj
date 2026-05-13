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
                        :external-id     external-id}))
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
  (metabot.feedback/persist-feedback! body)
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
   [:api-key-error {:optional true} [:maybe :string]]
   [:models [:sequential llm-model-response-schema]]])

(def ^:private metabot-settings-request-schema
  [:map
   [:provider metabot-provider-schema]
   [:model {:optional true} [:maybe :string]]
   [:api-key {:optional true} [:maybe :string]]])

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

(def ^:private invalid-api-key-statuses
  #{401 403})

(defn- invalid-api-key-error?
  [error]
  (let [status (or (:status (ex-data error))
                   (:status-code (ex-data error)))]
    (and (:api-error (ex-data error))
         (contains? invalid-api-key-statuses status))))

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
    (if (contains? #{"anthropic" "openrouter"} provider)
      (let [grouped-models (group-by :group decorated-models)]
        (->> grouped-models
             keys
             sort
             (mapcat #(get grouped-models %))
             vec))
      (vec decorated-models))))

(defn- provider-models-response
  ([provider]
   (provider-models-response provider nil))
  ([provider api-key-override]
   (if (= provider provider-util/metabase-provider-prefix)
     {:models (decorate-provider-models
               provider
               (:models (metabot.self/list-models "anthropic" {:ai-proxy? true})))}
     (let [effective-api-key (or (non-blank-string api-key-override)
                                 (non-blank-string
                                  (metabot.settings/configured-provider-api-key provider)))]
       (if (and provider effective-api-key)
         (try
           {:models (decorate-provider-models
                     provider
                     (:models (metabot.self/list-models provider {:api-key effective-api-key})))}
           (catch clojure.lang.ExceptionInfo e
             (if (invalid-api-key-error? e)
               {:models []
                :api-key-error (.getMessage e)}
               (throw e))))
         {:models []})))))

(defn- settings-response
  ([provider]
   (settings-response provider nil))
  ([provider api-key-override]
   (merge
    {:value (metabot.settings/llm-metabot-provider)}
    (provider-models-response provider api-key-override))))

(defn- current-provider
  []
  (provider-util/provider-and-model->provider (metabot.settings/llm-metabot-provider)))

(defn- current-setting-provider
  []
  (provider-util/provider-and-model->outer-provider (metabot.settings/llm-metabot-provider)))

(defn- throw-api-key-error!
  [response]
  (when-let [api-key-error (:api-key-error response)]
    (throw (ex-info api-key-error
                    {:status-code 400
                     :api-error true})))
  response)

(api.macros/defendpoint :get "/settings"
  :- metabot-settings-response-schema
  "Return available models for a provider using its configured API key."
  [_route-params
   {:keys [provider]} :- [:map
                          [:provider {:optional true} metabot-provider-schema]]]
  (perms/check-has-application-permission :setting)
  (settings-response (or provider (current-provider))))

(api.macros/defendpoint :put "/settings"
  :- metabot-settings-response-schema
  "Update the Metabot provider API key and/or model setting and return the refreshed settings payload."
  [_route-params
   _query-params
   body :- metabot-settings-request-schema]
  (perms/check-has-application-permission :setting)
  (let [{:keys [provider api-key] request-model :model} body
        current-provider (current-setting-provider)
        provider-changed? (not= current-provider provider)
        model (cond
                (non-blank-string request-model)
                (effective-provider-model provider request-model)

                provider-changed?
                (or (effective-provider-model provider request-model)
                    (metabot.settings/default-model-for-provider provider))

                :else
                nil)
        response (-> (settings-response provider api-key)
                     throw-api-key-error!)]
    (when (contains? body :api-key)
      (setting/set! (provider-api-key-setting-key provider) (non-blank-string api-key)))
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
