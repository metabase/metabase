(ns metabase.metabot.api
  "`/api/metabot/` routes"
  (:require
   [clojure.core.async :as a]
   [medley.core :as m]
   [metabase.ai-tracing.core :as ait]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.api.conversations]
   [metabase.metabot.api.document]
   [metabase.metabot.api.metabot]
   [metabase.metabot.api.permissions]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.envelope :as metabot.envelope]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as sr]
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
  (when-let [conversation (t2/select-one :model/MetabotConversation 'id conversation-id)]
    (api/check-403 (mi/can-read? conversation))))

(defn- make-out-of-sync-fn
  [conversation-id parent-message-id retry-message-id]
  (fn [reason & [cause]]
    (log/warn "Rejecting agent-streaming request"
              {:conversation-id   conversation-id
               :parent-message-id parent-message-id
               :retry-message-id  retry-message-id
               :reason            reason})
    (throw (ex-info (tru "This conversation has changed. Reload to see the latest messages.")
                    {:status-code 409 :reason reason}
                    cause))))

(defn- external-id-conflict?
  ;; driver-specific violation messages all contain the constraint name; see the
  ;; opaque-exception caveat on [[metabase.app-db.query/with-conflict-retry]]
  [e]
  (boolean (some #(re-find #"(?i)uq_metabot_message_external_id" (str (ex-message %)))
                 (u/full-exception-chain e))))

(defn- check-retry!
  [messages retry-message-id out-of-sync!]
  (let [retry-msg (u/seek #(= retry-message-id (:external_id %)) (rseq messages))
        last-user (u/seek #(= :user (:role %)) (rseq messages))]
    (cond
      (nil? retry-msg)                       (out-of-sync! :retry-message-not-found)
      (not= (:role retry-msg) :user)         (out-of-sync! :retry-message-not-user-role)
      (not= (:id retry-msg) (:id last-user)) (out-of-sync! :retry-message-not-last)
      :else
      (let [delete-ids (->> messages
                            (m/drop-upto #(= (:id %) (:id retry-msg)))
                            (filter #(= :assistant (:role %)))
                            (mapv :id))]
        (when (> (count delete-ids) 1)
          (log/warn "Retry found multiple live assistant rows for one prompt"
                    {:conversation-id (:conversation_id retry-msg) :message-ids delete-ids}))
        {:action :retry :message-ids delete-ids}))))

(defn- check-parent-msg!
  [messages parent-message-id out-of-sync!]
  (let [parent-msg (when parent-message-id
                     (u/seek #(= parent-message-id (:external_id %)) (rseq messages)))]
    (cond
      (and parent-message-id (nil? parent-msg))             (out-of-sync! :parent-message-not-found)
      (and parent-msg (not= (:role parent-msg) :assistant)) (out-of-sync! :parent-message-not-agent-role)
      :else
      (let [tail       (if parent-msg
                         (m/drop-upto #(= (:id %) (:id parent-msg)) messages)
                         messages)
            assistants (filter #(= :assistant (:role %)) tail)]
        (cond
          (and (seq assistants) (every? #(some? (:error %)) assistants))
          {:action :replace-failed-turn :message-ids (mapv :id tail)}

          (nil? parent-message-id) (out-of-sync! :parent-message-missing)
          :else                    (out-of-sync! :parent-message-stale))))))

(defn- check-turn!
  "Decides how the incoming request continues the conversation, reading only from the
  conversation's live `messages` (reader order, from [[metabot.persistence/live-messages]]):
    {:action :start}                                    — append a new turn
    {:action :retry :message-ids [pk...]}               — regenerate `retry-message-id`'s response,
                                                          soft-deleting the trailing live replies
    {:action :replace-failed-turn :message-ids [pk...]} — soft-delete trailing failed turns, then start
  Calls `out-of-sync!` (which throws 409) when the request does not line up with `messages`.

  A retry must target the last live user message. A plain request must either point
  `parent-message-id` at the leaf, or at the assistant message right before trailing
  turns that all failed (assistant rows with a recorded error) — the failed rows are
  then handed back for replacement."
  [messages parent-message-id retry-message-id out-of-sync!]
  (let [leaf-id (:external_id (u/seek #(= :assistant (:role %)) (rseq messages)))]
    (cond
      (some? retry-message-id)
      (check-retry! messages retry-message-id out-of-sync!)

      (= parent-message-id leaf-id)
      {:action :start}

      :else
      (check-parent-msg! messages parent-message-id out-of-sync!))))

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

(defn- inject-title-events-xf
  "Inject the title once its job settles, then stop watching to avoid repeated DB reads."
  [title-job conversation-id]
  (let [watching? (volatile! (boolean title-job))]
    (mapcat
     (fn [line]
       (if (or (not @watching?)
               (= self.core/done-sse-line line)
               (not (conversation-title/job-settled? title-job)))
         [line]
         (do
           (vreset! watching? false)
           (if-let [event (conversation-title/ready-title-event title-job conversation-id)]
             [line (self.core/format-sse-event event)]
             [line])))))))

(defn- native-agent-streaming-request
  "Handle streaming request using native Clojure agent.

  Streams AI SDK SSE `data: {UIMessageChunk}` events
  (see [[self.core/parts->aisdk-sse-xf]]) to the client in real-time while
  simultaneously collecting parts for database storage. Text parts are combined
  before storage to consolidate streaming chunks into single text parts.

  Monitors `canceled-chan` for client disconnection — when the client closes the
  connection, the pipeline stops via `reduced` and collected parts are still persisted.

  When `:debug?` is true, enables debug logging which emits a `debug_log` data
  part at the end of the stream with full LLM request/response data per iteration.

  `:assistant-msg-id` is the PK of the placeholder assistant row created by
  [[metabot.persistence/start-turn!]]; the finally block UPDATEs that row.
  `:external-id` is the assistant row's `external_id`, emitted as the SSE
  `start` event's `messageId` so the client can correlate streamed messages
  with feedback. `:user-external-id` is the turn's user row `external_id`,
  emitted as the `start` event's `messageMetadata.userMessageId`.
  `:state` is the reconstructed [[metabot.persistence/conversation-state]] —
  it seeds the agent loop as the immutable baseline for this turn's state."
  [{:keys [metabot-id profile-id message context history conversation-id state debug?
           eval-session-id assistant-msg-id external-id user-external-id title-job]}]
  (let [enriched-context (metabot.context/create-context context {:metabot-id metabot-id
                                                                  :profile-id (keyword profile-id)})
        messages         (concat history [message])]
    (sr/streaming-response {:content-type "text/event-stream"} [^OutputStream os canceled-chan]
      (let [parts-atom  (atom [])
            memory-atom (atom nil)
            canceled?   (volatile! false)
            ;; Captures throwables that escape the agent loop's own `catch Exception`
            ;; (e.g. setup-phase throws before the reducible is constructed, `Error`
            ;; subclasses, or failures from the agent's recovery `rf` write). Without
            ;; this, such turns finalize as `:finished true :error nil` — indistinguishable
            ;; from a clean success.
            thrown     (volatile! nil)
            xf         (comp (u/tee-xf parts-atom)
                             (self.core/parts->aisdk-sse-xf
                              (cond-> {:message-id external-id
                                       :context-window-tokens
                                       (metabot.self/context-window-tokens
                                        (metabot.settings/llm-metabot-provider))}
                                user-external-id (assoc :message-metadata {:userMessageId user-external-id})))
                             (inject-title-events-xf title-job conversation-id))]
        (try
          (transduce xf
                     (streaming-writer-rf os canceled-chan canceled?)
                     (agent/run-agent-loop
                      (cond-> {:messages        messages
                               :state           state
                               :metabot-id      metabot-id
                               :conversation-id conversation-id
                               :profile-id      (keyword profile-id)
                               :context         enriched-context
                               :eval-session-id eval-session-id
                               :memory-atom     memory-atom
                               :tracking-opts   {:session-id conversation-id}}
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
            (log/error "Native agent stream failed"
                       {:conversation-id conversation-id
                        :assistant-msg-id assistant-msg-id
                        :external-id     external-id
                        :error           (ex-message t)})
            ;; Stream a well-formed AI SDK error tail so the client surfaces the failure
            ;; instead of treating the truncated stream as a silent success. Unlike binary
            ;; downloads (which abort the connection), an event stream carries its own error
            ;; framing, so we emit the error event, a closing `finish`, and `[DONE]`, then let
            ;; the body fn return to close the socket cleanly — aborting here would deny the
            ;; client this very event.
            (try
              (.write os (.getBytes ^String (self.core/format-error-frames
                                             {:error (metabot.persistence/throwable->error-payload t)})
                                    "UTF-8"))
              (.flush os)
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
                 assistant-msg-id combined-parts
                 :profile-id profile-id
                 :finished?  (not aborted?)
                 :error      error-data
                 :turn-state (some-> @memory-atom memory/turn-state)))
              (catch Exception e
                (log/error "Failed to finalize assistant turn"
                           {:conversation-id  conversation-id
                            :assistant-msg-id assistant-msg-id
                            :external-id      external-id
                            :error            (ex-message e)})))))))))

(defn streaming-request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc.

  `request-info` is a map of `{:origin :referer :user-agent :ip-address}`. We split
  it into:
    - `hostname`: extracted from the origin URL, always recorded.
    - `pii-info`: gated by `analytics-pii-retention-enabled` — nil when off."
  [{:keys [metabot_id profile_id message context conversation_id debug eval_session_id parent_message_id retry_message_id
           user_message_id assistant_message_id]} request-info]
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
    (let [out-of-sync! (make-out-of-sync-fn conversation_id parent_message_id retry_message_id)
          {:keys [messages message-ids turn]}
          (metabot.persistence/with-conversation-lock conversation_id
            (let [messages (metabot.persistence/live-messages conversation_id)
                  {:keys [action message-ids]} (check-turn! messages parent_message_id retry_message_id out-of-sync!)
                  turn     (try
                             (if (= action :retry)
                               (metabot.persistence/retry-turn! conversation_id profile-id retry_message_id
                                                                :assistant-external-id assistant_message_id
                                                                :delete-message-ids message-ids)
                               (metabot.persistence/start-turn! conversation_id profile-id message
                                                                :hostname hostname
                                                                :pii-info pii-info
                                                                :delete-message-ids message-ids
                                                                :user-external-id user_message_id
                                                                :assistant-external-id assistant_message_id))
                             (catch Exception e
                               (if (external-id-conflict? e)
                                 (out-of-sync! :external-id-taken e)
                                 (throw e))))]
              {:messages messages :message-ids message-ids :turn turn}))
          {:keys [assistant-msg-id assistant-external-id user-external-id]} turn
          deleted?  (set message-ids)
          live      (remove #(deleted? (:id %)) messages)
          history   (metabot.persistence/history live)
          state     (metabot.persistence/conversation-state live)
          first-msg (or (:content (metabot.persistence/first-non-forked-user-message live))
                        (:content message))
          title-job (conversation-title/ensure-title!
                     conversation_id
                     (metabot.usage/valid-usage-profile-id profile-id)
                     first-msg)]
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
        :eval-session-id  eval_session_id
        :assistant-msg-id assistant-msg-id
        :external-id      assistant-external-id
        :user-external-id user-external-id
        :title-job        title-job}))))

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
            [:parent_message_id {:optional true} [:maybe ms/UUIDString]]
            [:retry_message_id {:optional true} [:maybe ms/UUIDString]]
            ;; eval-only: lets the benchmark harness name the per-session trace file it will read back.
            ;; Length + charset enforced at this HTTP boundary so a bad id 400s cleanly instead of
            ;; throwing deep in `ait/checked-session-id` and surfacing as a generic agent error.
            ;; `ait/max-session-id-length` / `ait/safe-session-id-re` are the single source of truth.
            [:eval_session_id {:optional true}
             [:maybe [:and [:string {:max ait/max-session-id-length}] [:re ait/safe-session-id-re]]]]
            [:user_message_id {:optional true} [:maybe ms/UUIDString]]
            [:assistant_message_id {:optional true} [:maybe ms/UUIDString]]
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
