(ns metabase.metabot.agent.core
  "Main agent loop implementation using reducible streaming infrastructure."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.ai-tracing.core :as ait]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.schema :as self.schema]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tools :as tools]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.util :as u]
   [metabase.util.async :as async.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

;;; Debug logging
;;
;; When `*debug-log*` is bound to an atom, the agent loop records full LLM
;; request/response data for every iteration. This is invaluable for debugging
;; benchmark failures — you can see exactly what the system prompt, message
;; history, and raw response were for each turn.
;;
;; Usage:
;;   (binding [core/*debug-log* (atom [])]
;;     (into [] (run-agent-loop opts))
;;     @core/*debug-log*)  ;; => [{:iteration 0 :request {...} :response [...]} ...]
;;
;; Or via the API with `"debug": true` in the request body, which emits the
;; debug log as a "debug_log" data part in the SSE stream.

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *debug-log*
  "When bound to an atom, collects full LLM request/response data per iteration.
  Each entry is a map with :iteration, :request, and :response keys.
  The :request contains :model, :system, :messages (full history), and :tools.
  The :response contains the collected parts from that iteration."
  nil)

(defn- collect-text-from-parts
  "Collect all text content from parts into a single string."
  [parts]
  (->> parts
       (filter #(= :text (:type %)))
       (map :text)
       (str/join "")))

(defn- summarize-tool-ios
  "Summarize tool inputs and outputs from parts."
  [parts]
  (let [inputs  (filter #(= :tool-input (:type %)) parts)
        outputs (filter #(= :tool-output (:type %)) parts)]
    {:tool-calls   (mapv (fn [p] {:id        (:id p)
                                  :function  (:function p)
                                  :arguments (:arguments p)})
                         inputs)
     :tool-results (mapv (fn [p] {:id     (:id p)
                                  :output (let [r (:result p)]
                                            (or (:output r) r))
                                  :error  (get-in p [:result :error])})
                         outputs)}))

(defn- debug-log!
  "Append a debug entry if *debug-log* is bound."
  [entry]
  (when *debug-log*
    (swap! *debug-log* conj entry)))

;;; Schemas

;;; Message schemas
;;
;; Input messages to the agent loop arrive in Chat Completions format (from the
;; API / frontend history).  `messages.clj` converts them into AISDK parts.
;;
;; `:content` can be either a plain string or a sequential of content blocks
;; (backward-compat with Claude-format messages stored by the old Python AI
;; service).

(mr/def ::content-block
  "A content block in a multi-part message (Claude format, backward-compat)."
  [:map {:closed true}
   [:type :string]]) ;; "text", "tool_use", "tool_result", etc.

(mr/def ::content
  "Message content — string or sequential of content blocks."
  [:or :string [:sequential ::content-block]])

(mr/def ::tool-call
  "A tool call in an assistant message."
  [:map {:closed true}
   [:id :string]
   [:name :string]
   [:arguments :string]])

(mr/def ::user-message
  "A user message: plain text or a sequence of tool_result content blocks."
  [:map {:closed true}
   [:role [:= :user]]
   [:content ::content]])

(mr/def ::assistant-message
  "An assistant message with optional text and/or tool calls."
  [:map {:closed true}
   [:role [:= :assistant]]
   [:content {:optional true} [:maybe ::content]]
   [:tool_calls {:optional true} [:maybe [:sequential ::tool-call]]]])

(mr/def ::system-message
  "A system message."
  [:map {:closed true}
   [:role [:= :system]]
   [:content :string]])

(mr/def ::tool-message
  "A tool result message, referencing a previous tool call by ID."
  [:map {:closed true}
   [:role [:= :tool]]
   [:tool_call_id :string]
   [:content :string]])

(mr/def ::message
  "A single message in the conversation history.
  Discriminated by :role — each role has its own required/optional fields."
  [:multi {:dispatch :role}
   [:user      ::user-message]
   [:assistant ::assistant-message]
   [:system    ::system-message]
   [:tool      ::tool-message]])

(mr/def ::messages
  "Sequence of messages in the conversation."
  [:sequential ::message])

(mr/def ::context
  "Context information for the agent."
  ::metabot.context/context)

(mr/def ::profile-id
  "Profile identifier keyword."
  [:enum :embedding_next :internal :internal-sql :sql :nlq :document-generate-content :slackbot :explorations])

(mr/def ::tracking-opts
  "Options for snowplow and prometheus analytics tracking."
  [:map {:closed true}
   [:session-id          {:optional true} [:maybe ms/UUIDString]]
   [:source              {:optional true} [:maybe :string]]
   [:tag                 {:optional true} [:maybe :string]]])

;;; Iteration control

(defn- has-tool-calls?
  "Check if any parts contain tool calls."
  [parts]
  (some #(= (:type %) :tool-input) parts))

(defn- successful-tool-output?
  "Whether a `:tool-output` part represents a successful call.

  Success is the absence of `:error`. It used to be the presence of `:structured-output`, which made
  a tool that produced no structured output indistinguishable from one that failed, and forced
  answer-producing tools to attach one whether a consumer read it or not."
  [part]
  (and (= (:type part) :tool-output)
       (nil? (get-in part [:result :error]))))

(defn- terminal-tool-call?
  "Whether `parts` contain a **successful** call to one of the profile's `terminal-tools` (a set of
  tool-name strings). This lets a profile end the turn as soon as it produces its answer (e.g. the
  `:sql` profile after a successful `edit_sql_query`, or `ask_for_sql_clarification`) instead of
  forcing the model to keep emitting tool calls under `:required-tool-call?`.

  Terminality is a per-profile decision — the same tool is non-terminal in profiles that don't list
  it. A *failed* terminal-tool call does not end the turn, so the model can still self-correct."
  [terminal-tools parts]
  (boolean
   (when (seq terminal-tools)
     (let [outputs (u/index-by :id (filter #(= :tool-output (:type %)) parts))]
       (some (fn [p]
               (and (= (:type p) :tool-input)
                    (contains? terminal-tools (:function p))
                    (successful-tool-output? (get outputs (:id p)))))
             parts)))))

(defn- truncated?
  "Whether the provider cut this iteration off at its output-token limit. A truncated
  turn may contain a half-streamed tool call, so it must not continue the loop."
  [parts]
  (some #(and (= (:type %) :usage)
              (= (:finish-reason %) "length"))
        parts))

(defn- errored?
  "Whether this iteration's LLM call failed. A response that fails partway may contain a tool
  call that never ran, so it must not continue the loop."
  [parts]
  (some #(= (:type %) :error) parts))

(def ^:private max-undeclared-failures
  "How many ordinary exceptions that no tool declared a turn survives when its model can answer in text. The next one
  ends it, which stops a retry loop."
  1)

(defn- undeclared-failure?
  "Whether `part` is a tool call that failed with an ordinary exception no tool declared. A tool that writes reports
  one as `:unconfirmed-write` instead, which ends the turn (see `tools.runtime/invoke`)."
  [part]
  (and (= (:type part) :tool-output)
       (tools.runtime/undeclared? (get-in part [:result :error :code]))))

(defn- terminal-error-message
  "The user-facing message that ends the turn after this iteration's tool calls, or nil if the turn goes on.

  An unrecoverable failure ends the turn: one only the user can act on, such as a permission denial
  or a failed write that may have been saved, or one the model can't work around, such as a JVM
  error. The message is the error's `:user-message`; an error without one gets the generic one,
  because `:output` is written for the model and says only that the call failed.

  An ordinary exception that no tool declared ([[undeclared-failure?]]) ends the turn only when
  `undeclared-failures`, the turn's count of them with this iteration's included, passes
  [[max-undeclared-failures]]. In a `profile` that requires a tool call the first one ends it,
  because that model can't answer in text after it. The message is then the generic one."
  [profile parts undeclared-failures]
  (let [terminal (some (fn [part]
                         (when (and (= (:type part) :tool-output)
                                    (= :unrecoverable (get-in part [:result :error :class]))
                                    (not (undeclared-failure? part)))
                           (get-in part [:result :error])))
                       parts)
        allowed  (if (:required-tool-call? profile) 0 max-undeclared-failures)]
    (when (or terminal (< allowed undeclared-failures))
      (or (not-empty (:user-message terminal))
          (tru "Something went wrong.")))))

(def ^:private step-limit-instruction
  "What the last call of a turn that reached its step limit asks of the model."
  (str "You have reached the step limit for this request and can't call tools any more. Reply to the user now: say "
       "what you couldn't do and why, from what you found in this turn. Don't name tools."))

(defn- step-limit-message
  "The reply for a turn that reached its step limit when its last call gives none."
  []
  (tru "{0} reached its step limit before it could finish. Try a more specific request."
       (metabot.settings/metabot-name)))

(defn- should-continue?
  "Determine if agent should continue iterating."
  [iteration max-iterations terminal-tools parts]
  (and (< iteration max-iterations)
       (has-tool-calls? parts)
       (not (terminal-tool-call? terminal-tools parts))
       (not (truncated? parts))
       (not (errored? parts))))

(defn- finish-reason
  "Determine why the agent loop stopped."
  [iteration max-iterations terminal-tools parts]
  (cond
    (truncated? parts)                         :length
    (errored? parts)                           :error
    (terminal-tool-call? terminal-tools parts) :terminal-tool
    (and (>= iteration max-iterations)
         (has-tool-calls? parts))              :max-iterations
    :else                                      :stop))

;;; Call LLM
(defn- part->invert-links-key
  "Return the key that might contain links that need to be inverted or nil if no such key exists."
  [part]
  (cond
    (and (= (:type part) :text) (string? (:text part)))
    :text
    (and (= (:role part) :user) (string? (:content part)))
    :content))

(defn- invert-links
  "Apply link inversion to all :text parts in a sequence of AISDK parts.
  Also inverts :content in user-role parts (which contain resolved URLs from prior requests)."
  [parts registry-map]
  (if (empty? registry-map)
    parts
    (mapv (fn [part]
            (let [links-key (part->invert-links-key part)]
              (cond-> part
                links-key (-> (update links-key links/invert-links registry-map)
                              (update links-key links/invert-slack-links registry-map)))))
          parts)))

(defn- turn-input-parts
  "The AISDK parts for this call of the turn: what the previous call sent, exactly as sent, then the parts added since.
  Rebuilding the history fetches the viewing context again and inverts links against a registry that grows within
  the turn, and Claude Opus, Sonnet and Haiku 5.5 and Fable 5.1 reject a replayed thinking block once anything
  before it has changed."
  [sent-parts context memory tools link-registry]
  (into sent-parts
        (invert-links (subvec (messages/build-message-history context memory tools) (count sent-parts))
                      link-registry)))

(defn- call-llm
  "Call the LLM and stream processed parts.

  Passes the AISDK `input-parts` to the adapter, which converts them to its native wire format. `tool-choice` is nil,
  or a `:tool_choice` value that [[metabase.metabot.self.core/LLMRequestOpts]] allows."
  [memory profile tools system-msg iteration tracking-opts link-registry-atom input-parts tool-choice]
  (let [model        (:model profile)
        llm-opts     (cond-> {}
                       tool-choice (assoc :tool-choice tool-choice))]
    (when *debug-log*
      (debug-log! {:iteration iteration
                   :phase     :request
                   :model     model
                   :system    (:content system-msg)
                   :parts     input-parts
                   :tools     (vec tools)}))
    (when (ait/capture-active?)
      (ait/record! {:ai/system      (:content system-msg)
                    :ai/input-parts input-parts
                    :ai/tool-count  (count tools)}))
    (eduction (streaming/post-process-xf (get-in memory [:state :queries] {})
                                         (get-in memory [:state :charts] {})
                                         link-registry-atom)
              (self/call-llm model (:content system-msg) input-parts tools tracking-opts llm-opts))))

(defn- record-response!
  "Record the `parts` that the LLM call of `iteration` returned, on the eval trace and in the debug log."
  [iteration parts]
  (when (ait/capture-active?)
    (ait/record! {:ai/output-text (collect-text-from-parts parts)
                  :ai/tool-io     (summarize-tool-ios parts)
                  ;; preserve data parts (e.g. generated_entity) emitted this iteration
                  :ai/data-parts  (filterv #(= :data (:type %)) parts)}))
  (when *debug-log*
    (debug-log! {:iteration iteration
                 :phase     :response
                 :text      (collect-text-from-parts parts)
                 :tools     (summarize-tool-ios parts)
                 :all-parts parts})))

;;; Memory management

(defn- get-structured-output [result]
  (or (:structured-output result) (:structured_output result)))

(defn- extract-queries
  "Extract and store queries from tool outputs."
  [memory parts]
  (transduce
   (comp (filter #(= :tool-output (:type %)))
         (map #(get-structured-output (:result %)))
         (filter #(and (:query-id %) (:query %))))
   (completing
    (fn [mem {:keys [query-id query]}]
      (memory/set-query mem query-id query)))
   memory
   parts))

(defn- extract-charts
  "Extract and store charts from tool outputs."
  [memory parts]
  (transduce
   (comp (filter #(= :tool-output (:type %)))
         (map #(get-structured-output (:result %)))
         (filter #(and (:chart-id %) (:query-id %))))
   (completing
    (fn [mem {:keys [chart-id query-id chart-type query]}]
      ;; Merge onto whatever's already at this chart-id rather than replacing it
      ;; outright. A chart seeded from viewing context (or written earlier this
      ;; same turn by the tool itself, see edit-chart-tool) can carry
      ;; :image_base_64/:timeline_events/:chart_config that the tool-output's
      ;; structured-output doesn't know about; a full replace would drop them.
      (memory/set-chart mem
                        chart-id
                        (merge (get-in mem [:state :charts chart-id])
                               {:chart_id chart-id
                                :query_id query-id
                                :queries [query]
                                :visualization_settings {:chart_type chart-type}}))))
   memory
   parts))

(defn- update-memory
  "Update memory with parts from an iteration."
  [memory parts]
  (-> memory
      (memory/add-step parts)
      (extract-queries parts)
      (extract-charts parts)))

;;; Context seeding

(defn- normalize-type [t]
  (cond (keyword? t) (name t)
        (string? t)  t
        :else        (some-> t str)))

(defn- ensure-context-item-id
  "Ensure a viewing context item has an :id, generating a UUID if missing.
  The Python ai-service auto-generates UUIDs for context items; we match that behavior."
  [item]
  (cond-> item
    (not (:id item)) (assoc :id (str (random-uuid)))))

(defn- ensure-card-query-id
  "Give the query of a saved question or model an ID of its own, as `:query_id`.
  The item's `:id` is the card ID, and `run_query` runs the saved version of the card by that ID. The query on
  screen can be different from the saved version, so the SQL edit tools get it by a different ID."
  [item]
  (cond-> item
    (and (#{"question" "model"} (normalize-type (:type item))) (map? (:query item)))
    (assoc :query_id (str (random-uuid)))))

(defn- assign-context-ids
  "Assign IDs to all viewing context items that lack one, and to the queries of saved questions and models.
  Must be called before both seed-state and enrich-context-for-template
  so they share consistent IDs."
  [context]
  (update context :user_is_viewing #(mapv (comp ensure-card-query-id ensure-context-item-id) %)))

(defn- extract-query-from-context-item
  "Extract [query-id query] from viewing context item."
  [{:keys [id type query query_id]}]
  (when (map? query)
    (case (normalize-type type)
      ("adhoc" "native")   (when id [(str id) query])
      ("question" "model") (when query_id [query_id query])
      nil)))

(defn- seed-state
  "Seed state with queries from viewing context."
  [state context]
  (reduce (fn [s item]
            (if-let [[qid q] (extract-query-from-context-item item)]
              (assoc-in s [:queries qid] q)
              s))
          state
          (:user_is_viewing context)))

(defn- extract-chart-configs-from-context-item
  "Extract chart configs from a viewing context item.
  Returns a sequence of [chart-config-id chart-config] pairs.

  Chart config IDs are constructed as '{context-item-id}' for single configs,
  or '{context-item-id}-{index}' for multiple configs on the same item."
  [{:keys [id chart_configs] :as _item}]
  (when (and id (seq chart_configs))
    (if (= 1 (count chart_configs))
      [[(str id) (first chart_configs)]]
      (map-indexed
       (fn [idx config]
         [(str id "-" idx) config])
       chart_configs))))

(defn- seed-chart-configs
  "Seed state with chart configs from viewing context.
  Chart configs contain pre-materialized series data from the frontend."
  [state context]
  (reduce (fn [s item]
            (if-let [configs (extract-chart-configs-from-context-item item)]
              (reduce (fn [s' [config-id config]]
                        (assoc-in s' [:chart-configs config-id] config))
                      s
                      configs)
              s))
          state
          (:user_is_viewing context)))

(defn chart-config->chart
  "Create chart structure from chart-config.
  `query-id` is the ID that seed-state stores the chart's query under, or nil if it stores no query for the chart."
  [chart-id query-id {:keys [query timeline_events] :as chart-config}]
  {:chart_id chart-id
   ;; edit_chart carries :query_id through (see extract-charts). It is never a card ID: run_query runs the saved
   ;; card by that ID.
   :query_id query-id
   :queries [query]
   :timeline_events (or timeline_events [])
   ;; TODO (lbrdnk 2026-03-25): Viz settings seem to be redundant wrt fix this PR is implementing. Figure out
   ;;                           what is the reason behind that if any and either add it or drop.
   :visualization_settings nil
   :chart_config chart-config})

(defn seed-charts
  "Reduce the chart-configs from context into charts."
  [state context]
  (reduce
   ;; This logic is flawed for items with more than 1 chart config. It expects at most 1 chart config per viewing item.
   ;; TODO (lbrdnk 2026-03-24): Figure out what is reasonable solution here. (ie no overwriting single config)
   (fn [acc {:keys [id chart_configs] :as item}]
     ;; TODO (lbrdnk 2026-03-24): This is developed against adhoc queries. Ensure other cases work too!
     (if-not (seq chart_configs)
       acc
       (update acc :charts merge
               (into {}
                     (map (comp
                           (juxt :chart_id identity)
                           ;; The ID of a saved card is an integer, and the chart tools get charts by a string ID.
                           (partial chart-config->chart
                                    (str id)
                                    (first (extract-query-from-context-item item)))))
                     chart_configs))))
   state
   (:user_is_viewing context)))

(defn- client-content-ids
  "Ids of the queries and charts this request's viewing context seeds, as opposed to ones the agent's own tools wrote.
  A refusal to present one of these is a real access attempt and gets the audited treatment; see
  [[metabase.metabot.tools.shared.content-store]]. Seeding a fresh map keeps this to what the client
  sent this turn."
  [context]
  (let [seeded (-> {} (seed-state context) (seed-charts context))]
    (into (set (keys (:queries seeded)))
          (keys (:charts seeded)))))

;;; Main loop

(def ^:private profile-id->required-permission
  "Map from profile-id to the metabot permission that must be `:yes` for a user
  to use that profile. Profiles not listed here have no profile-level permission gate."
  {:sql                       :permission/metabot-sql-generation
   ;; This profile queries in SQL only.
   :internal-sql              :permission/metabot-sql-generation
   :nlq                       :permission/metabot-nlq
   :document-generate-content :permission/metabot-other-tools
   :explorations              :permission/metabot-nlq})

(defn- check-metabot-access!
  "Throw a 400 if `profile-id` is not available on this instance,
  and a 403 if `perms` do not grant access to it."
  [profile-id perms]
  ;; The same message and status as an unknown profile,
  ;; so an eval-only profile refused here looks like one that doesn't exist.
  ;; The streaming endpoint makes this check too, before it saves the turn.
  (when-not (profiles/profile-available? profile-id)
    (throw (ex-info "Unknown profile" {:status-code 400})))
  (when-let [missing (scope/missing-permission perms (profile-id->required-permission profile-id))]
    (throw (ex-info (if (= missing :permission/metabot)
                      "You do not have permission to use the AI assistant."
                      (format "You do not have permission to use the %s assistant." (name profile-id)))
                    {:status-code 403
                     :type        :metabot/permission-denied}))))

(defn- turn-tracking-opts
  "The tracking opts of one turn: the caller's `tracking-opts` over the defaults, among them the request id that
  ties the turn's analytics events together. Built by [[run-agent-loop]] before [[init-agent]], which takes the
  result as given, so a turn that dies in the agent's setup still reports its finish."
  [profile-id tracking-opts]
  (merge {:profile-id          profile-id
          :request-id          (str (random-uuid))
          :source              "metabot_agent"
          :tag                 "agent"
          :required-permission (or (profile-id->required-permission profile-id)
                                   :permission/metabot)}
         tracking-opts))

(defn- init-agent
  "Initialize agent state.

  The system message and the tool declarations are rendered once for the whole turn. Both read settings or status
  that can change mid-turn, and a change would invalidate replayed thinking the same way an edited earlier message
  does (see [[turn-input-parts]])."
  [{:keys [messages state metabot profile-id context tracking-opts conversation-id request-canceled-chan]
    external-memory-atom :memory-atom}]
  (let [context      (assign-context-ids context)
        ;; Resolve the profile once (its nlq availability redirect probes the index): reuse it for both the
        ;; prompt and the tools so they can't disagree about whether the curated library tool is offered.
        profile      (or (profiles/get-profile profile-id)
                         (throw (ex-info "Unknown profile" {:profile-id profile-id})))
        capabilities (get context :capabilities #{})
        ;; Where run_query would refuse every call, it is not offered and the prompt does not promise results: where
        ;; other people can read the conversation, where there is no conversation or user to check, and for the
        ;; embedded Metabot, whatever profile the request names. The tool checks again, for someone who joins mid-turn.
        offered      (profiles/profile->tools profile capabilities)
        base-tools   (cond-> offered
                       (and (contains? offered "run_query")
                            (or (not (and conversation-id api/*current-user-id*))
                                (= (:entity_id metabot) metabot.config/embedded-metabot-id)
                                (metabot.db/conversation-open-to-others? conversation-id api/*current-user-id*)))
                       (dissoc "run_query"))
        seeded       (-> (or state {})
                         (seed-state context)
                         (seed-chart-configs context)
                         (seed-charts context))
        memory       (-> (memory/initialize messages seeded context)
                         (assoc :conversation-id conversation-id
                                :tool-names (set (keys base-tools))
                                :request-canceled-chan request-canceled-chan)
                         (memory/add-client-ids (client-content-ids context)))
        memory-atom  (doto (or external-memory-atom (atom nil)) (reset! memory))
        ;; `profile->tools` keys by name; `->entries` takes the tools themselves and keys them from
        ;; their declarations, so converted and unconverted ones arrive the same way.
        ;;
        ;; The show_chart argument only does anything alongside run_query, so a turn without
        ;; run_query declares construct_notebook_query as it was before the argument existed.
        ;; `without-show-chart` edits the entry's `:schema`, which `->entries` synthesises in the
        ;; same `[:=> [:cat args] out]` shape it read off the var before.
        tools        (update-vals (cond-> (tools/->entries (vals base-tools) memory-atom metabot profile-id)
                                    (not (contains? base-tools "run_query"))
                                    (m/update-existing "construct_notebook_query" tools/without-show-chart))
                                  #(assoc % :declaration (delay (self.schema/tool-function %))))]
    (log/info "Starting agent" {:profile  profile-id
                                :tools    (count tools)
                                :max-iter (:max-iterations profile)
                                :msgs     (count messages)})
    {:profile       profile
     :tools         tools
     :system-msg    (messages/build-system-message context profile tools)
     :context       context
     :memory-atom   memory-atom
     :tracking-opts tracking-opts}))

(defn- stop-recording-rf
  "Wrap `rf` so that `stopped?` turns true once `rf` returns `reduced`.

  The loop can't learn that its consumer stopped from what an iteration returns: the eductions an iteration reduces
  unwrap a `reduced` before they return."
  [rf stopped?]
  (fn [acc part]
    (u/prog1 (rf acc part)
      (when (reduced? <>)
        (vreset! stopped? true)))))

(defn- initial-loop-state
  "Create initial loop state from agent config and reduction context."
  [agent rf init usage-atom]
  (let [consumer-stopped? (volatile! false)]
    {:agent               agent
     :rf                  (stop-recording-rf rf consumer-stopped?)
     :consumer-stopped?   consumer-stopped?
     :result              init
     :iteration           1
     :status              :continue
     :usage-atom          usage-atom
     :sent-parts          []
     :undeclared-failures 0}))

(defn- final-state-part [memory]
  {:type :data, :data-type "state", :version 1, :data (memory/get-state memory)})

(defn- ended-loop-state
  "The loop state for a turn that ends after this iteration for `reason`.

  A `message` goes to the user as assistant text before the final state, and the status is `:reduced` instead when the
  consumer has stopped. Tool results are not rendered in the conversation, so a turn that ends on a terminal error or
  at the step limit would otherwise show no reply."
  [{:keys [agent rf iteration] :as loop-state} result reason message]
  (let [result (cond-> result
                 (and message (not (reduced? result))) (rf {:type :text, :id (str (random-uuid)), :text message}))]
    (if (reduced? result)
      (assoc loop-state :status :reduced :finish-reason :reduced :result @result)
      (do (if (= reason :length)
            (log/warn "Agent loop complete" {:iterations iteration :reason reason})
            (log/info "Agent loop complete" {:iterations iteration :reason reason}))
          (assoc loop-state
                 :status :done
                 ;; surfaced so run-agent-loop can record it on the turn span
                 :finish-reason reason
                 :result (rf result (final-state-part @(:memory-atom agent))))))))

(defn- error-part [^Exception e]
  {:type :error, :error (or (self/context-overflow-error e)
                            (self/provider-error e)
                            {:message (.getMessage e), :type (str (type e)), :data (ex-data e)})})

(defn- accumulate-usage-xf
  "Transducer that merges each `:usage` part into the cumulative usage atom
  (keyed by provider-and-model) and replaces the part's `:usage` with the running total.
  Also sets `:model` on the part to `provider-and-model` so downstream consumers
  (e.g. `extract-usage`) key usage by the canonical provider/model string rather
  than the raw model name returned by the API.

  The `metabase/` routing prefix is stripped so usage keys reflect the actual
  provider/model (e.g. `openrouter/anthropic/claude-haiku-4.5`) regardless of
  whether the request was routed through the AI proxy.
  Non-usage parts pass through unchanged."
  [usage-atom provider-and-model]
  (let [model (or (some-> provider-and-model llm.provider/strip-managed-prefix)
                  "unknown")]
    (map (fn [part]
           (if (= (:type part) :usage)
             (assoc part
                    :model model
                    :usage (-> (swap! usage-atom update model (partial merge-with +) (:usage part))
                               (get model)))
             part)))))

(defn- step-limit-reply-parts
  "The parts of the last LLM call of a turn that reached its step limit, or nil when there is no such call.

  The call asks the model to tell the user what it couldn't do and why. It is not made when the request this turn
  serves was canceled. When building its input or making it throws, its parts are only the usage it reported before
  that, which the turn's saved usage still has to count. The tools stay declared, since a changed tool set misses the
  prompt cache's tool and system prefix and invalidates the thinking that Claude replays, but the `none` tool choice
  lets the model call none of them."
  [{:keys [agent iteration usage-atom]} sent-parts]
  (let [{:keys [profile tools system-msg context memory-atom tracking-opts]} agent
        memory @memory-atom]
    (when-not (some-> (:request-canceled-chan memory) a/poll!)
      (let [iteration          (inc iteration)
            link-registry-atom (atom (get-in memory [:state :link-registry] {}))
            parts-atom         (atom [])]
        (try
          (let [input-parts (conj (turn-input-parts sent-parts context memory tools @link-registry-atom)
                                  {:role :user :content step-limit-instruction})]
            (u/prog1 (ait/with-llm-call {:ai/iteration iteration
                                         :ai/model     (:model profile)}
                       (u/prog1 (into [] (comp (accumulate-usage-xf usage-atom (:model profile))
                                               (u/tee-xf parts-atom))
                                      (call-llm memory profile tools system-msg iteration
                                                (assoc tracking-opts :iteration iteration)
                                                link-registry-atom input-parts "none"))
                         (record-response! iteration <>)))
              (swap! memory-atom memory/set-link-registry @link-registry-atom)))
          (catch Exception e
            (log/warn e "The last call of a turn at its step limit failed")
            (filterv #(= :usage (:type %)) @parts-atom)))))))

(defn- cut-short?
  "Whether a call's `parts` report that it stopped for a reason other than a normal end, such as its output limit or
  a content filter. A call whose adapter reports no reason is not cut short."
  [parts]
  (some #(and (= :usage (:type %))
              (some? (:finish-reason %))
              (not= "stop" (:finish-reason %)))
        parts))

(defn- text-reply?
  "Whether `parts`, from the last call of a turn at its step limit, hold a reply: text from a call that wasn't cut
  short, and no tool call or error."
  [parts]
  (and (not (str/blank? (collect-text-from-parts parts)))
       (not (has-tool-calls? parts))
       (not (cut-short? parts))
       (not (errored? parts))))

(defn- result-after-parts
  "`result` after reducing `parts` into it with `rf`, still wrapped in `reduced` when the consumer stops."
  [rf result parts]
  (reduce (fn [acc part]
            (let [acc (rf acc part)]
              (cond-> acc (reduced? acc) reduced)))
          result
          parts))

(defn- loop-step
  "Execute one iteration of the agent loop. Returns next loop state.

  Streams parts to the consumer as they arrive while simultaneously accumulating
  them for memory updates and control flow decisions."
  [{:keys [agent rf result iteration usage-atom sent-parts undeclared-failures consumer-stopped?] :as loop-state}]
  (with-span :debug {:name      :metabot.agent/loop-step
                     :iteration iteration}
    (let [{:keys [profile tools system-msg context memory-atom tracking-opts]} agent
          max-iter           (:max-iterations profile 15)
          terminal-tools     (set (:terminal-tools profile))
          tracking-opts      (assoc tracking-opts :iteration iteration)
          memory             @memory-atom
          parts-atom         (atom [])
          link-registry-atom (atom (get-in memory [:state :link-registry] {}))
          input-parts        (turn-input-parts sent-parts context memory tools @link-registry-atom)
          xf                 (comp (accumulate-usage-xf usage-atom (:model profile))
                                   (u/tee-xf parts-atom))
          ;; We use `reduce` instead of `transduce` because rf is the outer reducing
          ;; function (e.g. parts->aisdk-sse-xf wrapping streaming-writer-rf) whose completion
          ;; arity emits a finish message — that must only fire once, at the end of the
          ;; entire agent loop, not after every iteration.
          ;; `call-llm` runs inside the eval span so the request attrs it records attach here.
          result'            (ait/with-llm-call {:ai/iteration iteration
                                                 :ai/model     (:model profile)}
                               (let [llm-call       (call-llm memory profile tools system-msg iteration
                                                              tracking-opts link-registry-atom input-parts
                                                              (when (:required-tool-call? profile) "required"))
                                     reduced-result (reduce (xf rf) result llm-call)]
                                 (record-response! iteration @parts-atom)
                                 reduced-result))
          parts              @parts-atom]
      ;; Sync link registry back to memory after streaming completes
      (swap! memory-atom memory/set-link-registry @link-registry-atom)
      (log/debug "Iteration" {:n iteration :parts-count (count parts)})
      (if (empty? parts)
        ;; LLM returned nothing this iteration — a natural stop, surfaced for the turn span.
        (assoc loop-state :status :done :finish-reason :empty-response
               :result (rf result (final-state-part @memory-atom)))
        (do
          (log/debug "Got parts" {:count (count parts) :types (mapv :type parts)})
          (swap! memory-atom update-memory parts)
          ;; Every profile, not just the `:required-tool-call?` ones. The failure decides, and for an
          ;; ordinary exception that no tool declared, so do the profile and the turn's count of them.
          ;; A tool that wants the agent to carry on past a failure every time declares it
          ;; recoverable, which is a choice made at the error, where the reason for it is visible.
          (let [undeclared-failures (+ undeclared-failures (count (filter undeclared-failure? parts)))
                terminal-error      (terminal-error-message profile parts undeclared-failures)]
            (cond
              @consumer-stopped?
              ;; consumer signalled early termination (e.g. client disconnect / cancellation)
              (assoc loop-state :status :reduced :finish-reason :reduced :result (unreduced result'))

              terminal-error
              (ended-loop-state loop-state result' :terminal-error terminal-error)

              (should-continue? iteration max-iter terminal-tools parts)
              (assoc loop-state
                     :result result'
                     :iteration (inc iteration)
                     :sent-parts input-parts
                     :undeclared-failures undeclared-failures)

              :else
              (let [reason (finish-reason iteration max-iter terminal-tools parts)]
                ;; A model that must call a tool can't reply; elsewhere the web chat and Slack show a notice
                (if (and (= reason :max-iterations) (:required-tool-call? profile))
                  (let [reply-parts (step-limit-reply-parts loop-state input-parts)
                        reply?      (text-reply? reply-parts)]
                    (ended-loop-state loop-state
                                      (result-after-parts rf result' (cond->> reply-parts
                                                                       (not reply?) (filter #(= :usage (:type %)))))
                                      reason
                                      (when-not reply? (step-limit-message))))
                  (ended-loop-state loop-state result' reason nil))))))))))

(def ^:private failing-finish-reasons
  "The finish reasons that make the top-level `result` of an agent_turn_finished event an error, so a fleet query
  that filters `ai_service_event` on `result` counts failed turns the way it counts failed tool calls. A turn
  fails when the user got no answer, or an incomplete one:
  - `:error`           the LLM call failed, or an exception escaped the loop
  - `:terminal-error`  a tool failed unrecoverably, only the user can act
  - `:max-iterations`  the step cap was reached with tool calls still pending
  - `:empty-response`  the model returned nothing
  - `:length`          the provider cut the answer at its output-token limit

  Every other reason is a success, the user got what the turn could give:
  - `:stop`           the model ended its answer
  - `:terminal-tool`  a terminal tool completed the turn
  - `:reduced`        the client cancelled or disconnected; the server did not fail"
  #{:error :terminal-error :max-iterations :empty-response :length})

(defn- report-turn-finished!
  "Fires one agent_turn_finished :snowplow/ai_service_event per turn through [[self/track-ai-service-event!]], so
  it shares the envelope and the request id of the turn's agent_used_tool events and the fleet view can join a
  turn to its tool calls. `result` is error for a reason in [[failing-finish-reasons]], else success. The details carry the finish
  reason and the number of steps (LLM calls) the turn took, which on an exception is the step it died on; `steps`
  is absent when the turn died before the loop started."
  [tracking-opts finish-reason steps duration-ms]
  (self/track-ai-service-event! tracking-opts "agent_turn_finished"
                                {:duration-ms   (long duration-ms)
                                 :result        (if (contains? failing-finish-reasons finish-reason) "error" "success")
                                 :event-details (cond-> {"finish_reason" (name finish-reason)}
                                                  (some? steps) (assoc "steps" steps))}))

;;; Public API

(def ^:private debug-log-file
  "File path for debug log output. Only written in dev mode."
  "metabot-debug.json")

(defn- write-debug-log-file!
  "Write debug log to file in dev mode. Overwrites any existing file."
  [debug-log]
  (when config/is-dev?
    (try
      (with-open [w (io/writer debug-log-file)]
        (.write w (json/encode debug-log {:pretty true})))
      (log/debug "Wrote debug log to" debug-log-file)
      (catch Exception e
        (log/warnf "Failed to write debug log file: %s" (ex-message e))))))

(defn- debug-log-part
  "Create a data part containing the complete debug log.
  Emitted at the end of the stream when debug mode is active.
  Also writes to file in dev mode."
  [debug-log]
  (write-debug-log-file! debug-log)
  {:type      :data
   :data-type "debug_log"
   :version   1
   :data      debug-log})

(defn- eval-session-part
  "Create a data part carrying just the eval session id. Emitted at the end of the stream when
  `MB_AI_EVAL_CAPTURE` is enabled, so the benchmark/eval harness can locate the per-session
  `<session-id>.jsonl` trace file written by `metabase.ai-tracing.log`."
  [session-id]
  {:type      :data
   :data-type "eval_session"
   :version   1
   :data      {:session-id session-id}})

(mu/defn run-agent-loop
  "Run agent loop, returning a reducible of parts.

  When `:debug?` is true, binds `*debug-log*` and emits a `debug_log` data part
  at the end of the stream with the complete LLM request/response data for every
  iteration. This is useful for debugging benchmark failures.

  Usage:
    (into [] (run-agent-loop opts))
    (transduce xf rf (run-agent-loop opts))
    (into [] (run-agent-loop (assoc opts :debug? true)))  ;; with debug log"
  [opts :- [:map {:closed true}
            [:messages ::messages]
            [:profile-id ::profile-id]
            [:metabot ::metabot.schema/metabot]
            [:conversation-id {:optional true} [:maybe :string]]
            [:state {:optional true} [:maybe ::metabot.schema/state]]
            [:context {:optional true} [:maybe ::context]]
            [:tracking-opts {:optional true} [:maybe ::tracking-opts]]
            ;; eval-only: when supplied (e.g. by the benchmark harness), names the per-session
            ;; trace file so the caller can read it back without parsing the stream. Length + charset
            ;; are enforced here (rather than only deep in `ait/checked-session-id`) so a bad id 400s
            ;; at the boundary instead of surfacing as a generic agent error. `ait/max-session-id-length`
            ;; and `ait/safe-session-id-re` are the single source of truth for the cap and the charset.
            [:eval-session-id {:optional true}
             [:maybe [:and [:string {:max ait/max-session-id-length}] [:re ait/safe-session-id-re]]]]
            [:debug? {:optional true} [:maybe :boolean]]
            [:memory-atom {:optional true} [:maybe [:fn #(instance? clojure.lang.Atom %)]]]
            ;; Receives a value when the request this turn serves is canceled, so a tool can cancel the query it runs.
            [:request-canceled-chan {:optional true} [:maybe [:fn async.u/promise-chan?]]]]]
  (let [opts               (m/update-existing-in opts [:context :capabilities] capabilities/enforce-permissions)
        profile-id         (:profile-id opts)
        debug?             (:debug? opts)
        labels             {:profile-id (name profile-id)}
        perms              (or scope/*current-user-metabot-permissions*
                               (if api/*is-superuser?*
                                 scope/all-yes-permissions
                                 (scope/resolve-user-permissions api/*current-user-id*)))
        scopes             (if api/*is-superuser?*
                             api-scope/unrestricted
                             (scope/user-metabot-perms->scopes perms))]
    (check-metabot-access! profile-id perms)
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (with-span :info {:name       :metabot.agent/run-agent-loop
                          :profile-id profile-id
                          :msg-count  (count (:messages opts))}
          (analytics/inc! :metabase-metabot/agent-requests labels)
          (let [start-ms      (u/start-timer)
                ;; built before the agent, and the step in progress kept outside the loop state, so a turn that
                ;; dies on an exception still reports its finish and the step it died on
                turn-tracking (turn-tracking-opts profile-id (:tracking-opts opts))
                turn-step     (atom nil)]
            (binding [*debug-log*                              (when debug? (atom []))
                      scope/*current-user-scope*               scopes
                      scope/*current-user-metabot-permissions* perms
                      scope/*current-user-capabilities*        (get-in opts [:context :capabilities] #{})
                      scope/*current-loadable-skill-ids*       (atom #{})
                      metabot.perms/*cache*                    (atom {})]
              (try
                ;; `with-eval-session` establishes the eval capture (gated by MB_AI_EVAL_CAPTURE,
                ;; inherited when an in-process `capture-reducible` already bound one). Spans stream
                ;; to the per-session JSONL file as they finish.
                (ait/with-eval-session (:eval-session-id opts)
                  (let [turn-result
                        (ait/with-agent-turn {:ai/profile-id (name profile-id)
                                              :ai/msg-count  (count (:messages opts))
                                              ;; the user's latest question — trace-level input for evals
                                              :ai/user-input (some->> (:messages opts)
                                                                      (filter #(= "user" (some-> % :role name)))
                                                                      last :content)
                                              ;; full request — makes the trace a self-contained record
                                              :ai/messages   (:messages opts)
                                              :ai/context    (:context opts)
                                              :ai/state      (:state opts)}
                          (let [agent      (init-agent (assoc opts :tracking-opts turn-tracking))
                                usage-atom (atom {})
                                {:keys [result iteration finish-reason consumer-stopped?]}
                                (->> (initial-loop-state agent rf init usage-atom)
                                     (iterate (fn [loop-state]
                                                (reset! turn-step (:iteration loop-state))
                                                (loop-step loop-state)))
                                     (drop-while #(= :continue (:status %)))
                                     first)]
                            (analytics/observe! :metabase-metabot/agent-iterations labels iteration)
                            ;; Materialized turn-level outputs for evals: token usage, why the loop
                            ;; stopped, and the final agent state (link registry / generated entities).
                            (when (ait/capture-active?)
                              (ait/record! {:ai/finish-reason finish-reason
                                            :ai/usage         @usage-atom
                                            :ai/final-state   (some-> (:memory-atom agent) deref :state)}))
                            ;; A consumer that stopped (client disconnect / cancellation) has terminated the
                            ;; reducing fn, at whichever write it stopped, and stepping it again would violate
                            ;; the transducer contract.
                            ;; Append trailing parts only on a normal finish: the debug log, the
                            ;; loop's finish reason, and the eval-session pointer that lets the
                            ;; harness locate the per-session `<session-id>.jsonl` (it reads that
                            ;; file, not the stream, so a skipped pointer on disconnect costs
                            ;; nothing). Gate the pointer on a non-nil `*session-id*` too: the
                            ;; in-process `capture-reducible`/`capturing` path is capture-active but
                            ;; deliberately file-less (session id nil, read `:trace`), so emitting a
                            ;; pointer there would name a `<nil>.jsonl` that never exists.
                            (let [result' (if @consumer-stopped?
                                            (unreduced result)
                                            (-> result
                                                (cond->
                                                 (and debug? (seq @*debug-log*))            (rf (debug-log-part @*debug-log*))
                                                 (and (ait/capture-active?) ait/*session-id*) (rf (eval-session-part ait/*session-id*)))
                                                (rf {:type :finish :finish-reason finish-reason})))]
                              ;; Report last, after the trailing parts: a throw anywhere above reaches only
                              ;; the catch below, so a turn is reported once, never as both stop and error.
                              (report-turn-finished! turn-tracking finish-reason iteration (u/since-ms start-ms))
                              result')))]
                    turn-result))
                (catch Exception e
                  (analytics/inc! :metabase-metabot/agent-errors labels)
                  (report-turn-finished! turn-tracking :error @turn-step (u/since-ms start-ms))
                  (let [{:keys [api-error status provider]} (ex-data e)
                        msg (ex-message e)]
                    (cond
                      (and api-error status)
                      (log/errorf "Agent loop API error: %s status=%s provider=%s"
                                  msg status provider)

                      api-error
                      (log/errorf "Agent loop API error: %s provider=%s" msg provider)

                      ;; ex-message can be nil/blank for exceptions thrown without a message
                      ;; (e.g. (NullPointerException.)) — skip the colon when there's nothing to say.
                      (str/blank? msg)
                      (log/error "Agent loop error")

                      :else
                      (log/errorf "Agent loop error: %s" msg)))
                  (rf init (error-part e)))
                (finally
                  (analytics/observe! :metabase-metabot/agent-duration-ms labels (u/since-ms start-ms)))))))))))
