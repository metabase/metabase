(ns metabase.metabot.api
  "`/api/metabot/` routes"
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.app-db.core :as app-db]
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
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as sr]
   [metabase.settings.core :as setting]
   [metabase.slackbot.api]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)))

(set! *warn-on-reflection* true)

(defn- check-conversation-owner!
  "Throw a 403 if a `MetabotConversation` with `conversation-id` already exists and
  the current user cannot read it. New conversations (no row yet) are allowed so
  the first store-messages! call can claim them for the current user."
  [conversation-id]
  (when-let [conversation (t2/select-one :model/MetabotConversation :id conversation-id)]
    (api/check-403 (mi/can-read? conversation))))

(defn- store-aiservice-messages!
  "Store messages that are going from ai-service"
  [conversation-id profile-id ip-address embed-url messages]
  (let [finish   (let [m (u/last messages)]
                   (when (= (:_type m) :FINISH_MESSAGE)
                     m))
        state    (u/seek #(and (= (:_type %) :DATA)
                               (= (:type %) "state"))
                         messages)
        messages (-> (remove #(or (= % state) (= % finish)) messages)
                     vec)
        ai-proxy? (provider-util/metabase-provider? (metabot.settings/llm-metabot-provider))]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (fn [existing]
                                (cond-> {:user_id api/*current-user-id*}
                                  state                         (assoc :state state)
                                  (nil? (:ip_address existing)) (assoc :ip_address ip-address)
                                  (nil? (:embed_url existing))  (assoc :embed_url embed-url))))
    ;; NOTE: this will need to be constrained at some point, see BOT-386
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :data            messages
                 :usage           (:usage finish)
                 :role            (:role (first messages))
                 :profile_id      profile-id
                 :total_tokens    (->> (vals (:usage finish))
                                       ;; NOTE: this filter is supporting backward-compatible usage format, can be
                                       ;; removed when ai-service does not give us `completionTokens` in `usage`
                                       (filter map?)
                                       (map #(+ (:prompt %) (:completion %)))
                                       (apply +))
                 :ai_proxied      (boolean ai-proxy?)})))

(defn- extract-usage
  "Extract usage from parts, taking the last `:usage` per model.

  The agent loop emits cumulative usage — each `:usage` part subsumes all prior
  usage for that model — so we simply take the last one per model rather than
  summing. Returns a map keyed by model name:
  {\"model-name\" {:prompt X :completion Y}}"
  [parts]
  (transduce
   (filter #(= :usage (:type %)))
   (completing
    (fn [acc {:keys [usage model]}]
      (let [model (or model "unknown")]
        (assoc acc model {:prompt     (:promptTokens usage 0)
                          :completion (:completionTokens usage 0)}))))
   {}
   parts))

(def ^:private persisted-structured-output-keys
  "Subset of `:structured-output` that must survive persistence so
  `metabase-enterprise.metabot-analytics.queries` can surface generated
  queries on the admin detail page."
  [:query-id :query-content :query :database])

(defn- trim-structured-output [structured]
  (when (map? structured)
    (not-empty (select-keys structured persisted-structured-output-keys))))

(defn- strip-tool-output-bloat
  "For :tool-output parts, keep `:output` and a trimmed `:structured-output` in
  the result map. Both LLM adapters only read `(get-in part [:result :output])`
  when replaying history, so `:output` is all they need. The analytics extractor,
  however, reads a small subset of `:structured-output` off persisted messages
  (see `persisted-structured-output-keys`), so we keep those four keys and drop
  everything else (`:resources`, `:data-parts`, `:reactions`, …) — that's where
  the bulk of the bloat lives."
  [{:keys [type] :as part}]
  (if (= :tool-output type)
    (update part :result
            (fn [r]
              (cond-> (select-keys r [:output])
                (trim-structured-output (:structured-output r))
                (assoc :structured-output (trim-structured-output (:structured-output r)))
                (trim-structured-output (:structured_output r))
                (assoc :structured_output (trim-structured-output (:structured_output r))))))
    part))

(defn- store-native-parts!
  "Store assistant response parts directly to the database.

  Takes AI SDK parts (after aisdk-xf combining) and stores them in the native format,
  avoiding the intermediate 'aisdk messages' format.

  Parts format: [{:type :text :text \"...\"} {:type :tool-input ...} ...]"
  [conversation-id profile-id ip-address embed-url parts]
  (let [state-part (u/seek #(and (= :data (:type %))
                                 (= "state" (:data-type %)))
                           parts)
        usage      (extract-usage parts)
        ai-proxy?  (provider-util/metabase-provider? (metabot.settings/llm-metabot-provider))
        ;; Filter out :start, :usage, :finish, :data - these are metadata, not message content
        ;; :data is like `:navigate_to`
        content    (->> parts
                        (remove #(#{:start :usage :finish :data} (:type %)))
                        (mapv strip-tool-output-bloat))]
    (prometheus/observe! :metabase-metabot/message-persist-bytes
                         {:profile-id (or profile-id "unknown")}
                         (u/string-byte-count (json/encode content)))
    (t2/with-transaction [_conn]
      (when state-part
        (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                                  (fn [existing]
                                    (cond-> {:user_id api/*current-user-id*
                                             :state   (:data state-part)}
                                      (nil? (:ip_address existing)) (assoc :ip_address ip-address)
                                      (nil? (:embed_url existing))  (assoc :embed_url embed-url)))))
      (t2/insert! :model/MetabotMessage
                  {:conversation_id conversation-id
                   :data            content
                   :usage           usage
                   :role            :assistant
                   :profile_id      profile-id
                   :total_tokens    (->> (vals usage)
                                         (map #(+ (:prompt %) (:completion %)))
                                         (reduce + 0))
                   :ai_proxied      (boolean ai-proxy?)}))))

(defn- streaming-writer-rf
  "Creates a reducing function that writes AI SDK lines to an OutputStream.

  Lines are written immediately with a newline and flushed for real-time streaming.
  When `canceled-chan` is provided, polls it before each write and returns `reduced`
  to stop the pipeline when the client has disconnected. Also catches EofException
  (client closed connection) and converts it to `reduced` so the pipeline shuts down
  cleanly without triggering upstream retries."
  [^java.io.OutputStream os canceled-chan]
  (fn
    ([] nil)
    ([_] nil)
    ([acc ^String line]
     (if (and canceled-chan (a/poll! canceled-chan))
       (reduced acc)
       (try
         (.write os (.getBytes (str line "\n") "UTF-8"))
         (.flush os)
         (catch org.eclipse.jetty.io.EofException _
           (reduced acc)))))))

(defn- combine-text-parts-xf []
  (fn [rf]
    (let [pending (volatile! nil)]
      (fn
        ([] (rf))
        ([result]
         (let [p @pending]
           (rf (if p (rf result p) result))))
        ([result part]
         (let [prev @pending]
           (if (and prev (= :text (:type prev) (:type part)))
             (do (vswap! pending update :text str (:text part))
                 result)
             (do (vreset! pending part)
                 (if prev (rf result prev) result)))))))))

(defn- native-agent-streaming-request
  "Handle streaming request using native Clojure agent.

  Streams AI SDK v4 line protocol to the client in real-time while simultaneously
  collecting parts for database storage. Text parts are combined before storage
  to consolidate streaming chunks into single text parts.

  Monitors `canceled-chan` for client disconnection — when the client closes the
  connection, the pipeline stops via `reduced` and collected parts are still persisted.

  When `:debug?` is true, enables debug logging which emits a `debug_log` data
  part at the end of the stream with full LLM request/response data per iteration."
  [{:keys [metabot-id profile-id message context history conversation-id state debug? ip-address embed-url]}]
  (let [enriched-context (metabot.context/create-context context)
        messages         (concat history [message])]
    (sr/streaming-response {:content-type "text/event-stream"} [^OutputStream os canceled-chan]
      (let [parts-atom (atom [])
            ;; Compose: collect parts AND convert to lines for streaming.
            ;; In dev mode, emit usage parts in the SSE stream for debugging/benchmarking.
            xf         (comp (u/tee-xf parts-atom)
                             (self.core/aisdk-line-xf {:emit-usage? config/is-dev?}))]
        (try
          (transduce xf
                     (streaming-writer-rf os canceled-chan)
                     (agent/run-agent-loop
                      (cond-> {:messages      messages
                               :state         state
                               :metabot-id    metabot-id
                               :profile-id    (keyword profile-id)
                               :context       enriched-context
                               :tracking-opts {:session-id conversation-id}}
                        debug? (assoc :debug? true))))
          (catch org.eclipse.jetty.io.EofException _
            (log/debug "Client disconnected during native agent streaming"))
          (finally
            (store-native-parts! conversation-id profile-id ip-address embed-url
                                 (into [] (combine-text-parts-xf) @parts-atom))))))))

(defn streaming-request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [{:keys [metabot_id profile_id message context history conversation_id state debug]} ip-address embed-url]
  (let [message    (metabot.envelope/user-message message)
        metabot-id (metabot.config/resolve-dynamic-metabot-id metabot_id)
        _          (metabot.config/check-metabot-enabled! metabot-id)
        profile-id (metabot.config/resolve-dynamic-profile-id profile_id metabot-id)
        ;; Only allow debug mode in dev — never in production
        debug?     (and config/is-dev? (boolean debug))]
    (check-conversation-owner! conversation_id)
    (store-aiservice-messages! conversation_id profile-id ip-address embed-url [message])

    (log/info "Using native Clojure agent" {:profile-id profile-id :debug? debug?})
    (native-agent-streaming-request
     {:metabot-id      metabot-id
      :profile-id      profile-id
      :message         message
      :context         context
      :history         history
      :conversation-id conversation_id
      :state           state
      :debug?          debug?
      :ip-address      ip-address
      :embed-url       embed-url})))

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
  (let [body* (m/update-existing body [:context :user_is_viewing] upgrade-viewing-queries)]
    (streaming-request body* (request/ip-address req) (request/referer req))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/feedback"
  "Proxy Metabot feedback to Harbormaster, adding the premium embedding token."
  [_route-params
   _query-params
   feedback :- :map]
  (metabot.config/check-metabot-enabled!)
  (try
    (api/check-400 (metabot.feedback/submit-to-harbormaster! feedback)
                   "Cannot submit feedback. The license token and/or Store API URL are missing!")
    api/generic-204-no-content
    (catch Exception e
      (log/error e "Failed to submit feedback to Harbormaster")
      (throw e))))

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
  (cond
    (nil? model) nil
    (and (= provider provider-util/metabase-provider-prefix) (str/blank? model)) metabot.settings/default-llm-metabot-provider
    :else (non-blank-string model)))

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
  (let [{:keys [provider model api-key]} body
        model (effective-provider-model provider model)
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
