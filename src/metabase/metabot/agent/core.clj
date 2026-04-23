(ns metabase.metabot.agent.core
  "Main agent loop implementation using reducible streaming infrastructure."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.messages :as messages]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.provider-util :as provider-util]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as self]
   [metabase.metabot.tools :as tools]
   [metabase.util :as u]
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
                                  :error  (:error p)})
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
  [:map
   [:type :string]]) ;; "text", "tool_use", "tool_result", etc.

(mr/def ::content
  "Message content — string or sequential of content blocks."
  [:or :string [:sequential ::content-block]])

(mr/def ::tool-call
  "A tool call in an assistant message."
  [:map
   [:id :string]
   [:name :string]
   [:arguments [:or :string :map]]])

(mr/def ::user-message
  "A user message: plain text or a sequence of tool_result content blocks."
  [:map
   [:role [:= :user]]
   [:content ::content]])

(mr/def ::assistant-message
  "An assistant message with optional text and/or tool calls."
  [:map
   [:role [:= :assistant]]
   [:content {:optional true} [:maybe ::content]]
   [:tool_calls {:optional true} [:maybe [:sequential ::tool-call]]]])

(mr/def ::system-message
  "A system message."
  [:map
   [:role [:= :system]]
   [:content :string]])

(mr/def ::tool-message
  "A tool result message, referencing a previous tool call by ID."
  [:map
   [:role [:= :tool]]
   [:tool_call_id :string]
   [:content [:or :string :map]]])

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

(mr/def ::state
  "Agent state containing queries, charts, chart-configs, todos, transforms, and link-registry."
  [:map
   [:queries {:optional true} [:map-of [:or :string :keyword] :map]]
   [:charts {:optional true} [:map-of [:or :string :keyword] :map]]
   [:chart-configs {:optional true} [:map-of [:or :string :keyword] :map]]
   [:todos {:optional true} [:sequential :map]]
   [:transforms {:optional true} [:map-of [:or :string :keyword] :map]]
   [:link-registry {:optional true} [:map-of [:or :string :keyword] :string]]])

(mr/def ::context
  "Context information for the agent."
  [:map-of :keyword :any])

(mr/def ::profile-id
  "Profile identifier keyword."
  [:enum :embedding_next :internal :transforms_codegen :sql :nlq :document-generate-content :slackbot])

(mr/def ::tracking-opts
  "Options for snowplow and prometheus analytics tracking."
  [:map
   [:session-id          {:optional true} [:maybe ms/UUIDString]]
   [:source              {:optional true} [:maybe :string]]
   [:tag                 {:optional true} [:maybe :string]]])

;;; Iteration control

(defn- has-tool-calls?
  "Check if any parts contain tool calls."
  [parts]
  (some #(= (:type %) :tool-input) parts))

(defn- has-final-response?
  "Check if any tool result signals a final response."
  [parts]
  (some #(and (= (:type %) :tool-output)
              (get-in % [:result :final-response?]))
        parts))

(defn- should-continue?
  "Determine if agent should continue iterating."
  [iteration max-iterations parts]
  (and (< iteration max-iterations)
       (has-tool-calls? parts)
       (not (has-final-response? parts))))

(defn- finish-reason
  "Determine why the agent loop stopped."
  [iteration max-iterations parts]
  (cond
    (>= iteration max-iterations) :max-iterations
    (has-final-response? parts)   :final-response
    :else                         :stop))

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

(defn- call-llm
  "Call the LLM and stream processed parts.

  Builds AISDK parts from memory and passes them to the adapter which converts
  them to its native wire format."
  [memory context profile tools iteration tracking-opts link-registry-atom]
  (let [model        (:model profile)
        system-msg   (messages/build-system-message context profile tools)
        input-parts  (-> (messages/build-message-history context memory)
                         (invert-links @link-registry-atom))
        llm-opts     (cond-> {}
                       (:required-tool-call? profile) (assoc :tool-choice "required"))]
    (when *debug-log*
      (debug-log! {:iteration iteration
                   :phase     :request
                   :model     model
                   :system    (:content system-msg)
                   :parts     input-parts
                   :tools     (vec tools)}))
    (eduction (streaming/post-process-xf (get-in memory [:state :queries] {})
                                         (get-in memory [:state :charts] {})
                                         link-registry-atom)
              (self/call-llm model (:content system-msg) input-parts tools tracking-opts llm-opts))))

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
      (memory/remember-query mem query-id query)))
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
    (fn [mem {:keys [chart-id chart-type query]}]
      (memory/store-chart mem
                          chart-id
                          {:chart_id chart-id
                           :queries [query]
                           :visualization_settings {:chart_type chart-type}})))
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

(defn- assign-context-ids
  "Assign IDs to all viewing context items that lack one.
  Must be called before both seed-state and enrich-context-for-template
  so they share consistent IDs."
  [context]
  (update context :user_is_viewing #(mapv ensure-context-item-id %)))

(defn- extract-query-from-context-item
  "Extract [query-id query] from viewing context item."
  [{:keys [id type query source] :as _item}]
  (let [t (normalize-type type)]
    (cond
      (and (#{"adhoc" "native"} t) (map? query) id)
      [(str id) query]

      (and (= "transform" t)
           (= "query" (normalize-type (:type source)))
           (map? (:query source))
           id)
      [(str id) (:query source)])))

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
  "Create chart structure from chart-config"
  [id {:keys [query timeline_events image_base_64] :as chart-config}]
  {:chart_id id
   :queries [query]
   :image_base_64 image_base_64
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
   (fn [acc {:keys [id chart_configs] :as _item}]
     ;; TODO (lbrdnk 2026-03-24): This is developed against adhoc queries. Ensure other cases work too!
     (if-not (seq chart_configs)
       acc
       (update acc :charts merge
               (into {}
                     (map (comp
                           (juxt :chart_id identity)
                           (partial chart-config->chart id)))
                     chart_configs))))
   state
   (:user_is_viewing context)))

;;; Main loop

(defn- init-agent
  "Initialize agent state."
  [{:keys [messages state metabot-id profile-id context tracking-opts]}]
  (let [context      (assign-context-ids context)
        profile      (or (profiles/get-profile profile-id)
                         (throw (ex-info "Unknown profile" {:profile-id profile-id})))
        capabilities (get context :capabilities #{})
        base-tools   (profiles/get-tools-for-profile profile-id capabilities)
        seeded       (-> (or state {})
                         (seed-state context)
                         (seed-chart-configs context)
                         (seed-charts context))
        memory       (-> (memory/initialize messages seeded context)
                         (memory/load-queries-from-state seeded)
                         (memory/load-charts-from-state seeded)
                         (memory/load-transforms-from-state seeded)
                         (memory/load-todos-from-state seeded)
                         (memory/load-link-registry-from-state seeded))
        memory-atom  (atom memory)
        tools        (tools/wrap-tools-with-state base-tools memory-atom metabot-id)]
    (log/info "Starting agent" {:profile  profile-id
                                :tools    (count tools)
                                :max-iter (:max-iterations profile)
                                :msgs     (count messages)})
    {:profile       profile
     :tools         tools
     :context       context
     :memory-atom   memory-atom
     :tracking-opts (merge {:profile-id profile-id
                            :request-id (str (random-uuid))
                            :source     "metabot_agent"
                            :tag        "agent"}
                           tracking-opts)}))

(defn- initial-loop-state
  "Create initial loop state from agent config and reduction context."
  [agent rf init usage-atom]
  {:agent      agent
   :rf         rf
   :result     init
   :iteration  1
   :status     :continue
   :usage-atom usage-atom})

(defn- final-state-part [memory]
  {:type :data, :data-type "state", :version 1, :data (memory/get-state memory)})

(defn- error-part [^Exception e]
  {:type :error, :error {:message (.getMessage e), :type (str (type e)), :data (ex-data e)}})

(defn- accumulate-usage-xf
  "Transducer that merges each `:usage` part into the cumulative usage atom
  (keyed by provider-and-model) and replaces the part's `:usage` with the running total.
  Also sets `:model` on the part to `provider-and-model` so downstream consumers
  (e.g. `extract-usage`) key usage by the canonical provider/model string rather
  than the raw model name returned by the API.

  The `metabase/` routing prefix is stripped so usage keys reflect the actual
  provider/model (e.g. `openrouter/anthropic/claude-haiku-4-5`) regardless of
  whether the request was routed through the AI proxy.
  Non-usage parts pass through unchanged."
  [usage-atom provider-and-model]
  (let [model (or (some-> provider-and-model provider-util/strip-metabase-prefix)
                  "unknown")]
    (map (fn [part]
           (if (= (:type part) :usage)
             (assoc part
                    :model model
                    :usage (-> (swap! usage-atom update model (partial merge-with +) (:usage part))
                               (get model)))
             part)))))

(defn- loop-step
  "Execute one iteration of the agent loop. Returns next loop state.

  Streams parts to the consumer as they arrive while simultaneously accumulating
  them for memory updates and control flow decisions."
  [{:keys [agent rf result iteration usage-atom] :as loop-state}]
  (with-span :debug {:name      :metabot.agent/loop-step
                     :iteration iteration}
    (let [{:keys [profile tools context memory-atom tracking-opts]} agent
          max-iter           (:max-iterations profile 10)
          tracking-opts      (assoc tracking-opts :iteration iteration)
          memory             @memory-atom
          parts-atom         (atom [])
          link-registry-atom (atom (get-in memory [:state :link-registry] {}))
          llm-call           (call-llm memory context profile tools iteration tracking-opts link-registry-atom)
          xf                 (comp (accumulate-usage-xf usage-atom (:model profile))
                                   (u/tee-xf parts-atom))
          ;; We use `reduce` instead of `transduce` because rf is the outer reducing
          ;; function (e.g. aisdk-line-xf wrapping streaming-writer-rf) whose completion
          ;; arity emits a finish message — that must only fire once, at the end of the
          ;; entire agent loop, not after every iteration.
          result'            (reduce (xf rf) result llm-call)
          parts              @parts-atom]
      ;; Sync link registry back to memory after streaming completes
      (swap! memory-atom assoc-in [:state :link-registry] @link-registry-atom)
      ;; Capture response for debug log
      (when *debug-log*
        (debug-log! {:iteration iteration
                     :phase     :response
                     :text      (collect-text-from-parts parts)
                     :tools     (summarize-tool-ios parts)
                     :all-parts parts}))
      (log/debug "Iteration" {:n iteration :parts-count (count parts)})
      (if (empty? parts)
        (assoc loop-state :status :done :result (rf result (final-state-part @memory-atom)))
        (do
          (log/debug "Got parts" {:count (count parts) :types (mapv :type parts)})
          (swap! memory-atom update-memory parts)
          (cond
            (reduced? result')
            (assoc loop-state :status :reduced :result @result')

            (should-continue? iteration max-iter parts)
            (assoc loop-state :result result' :iteration (inc iteration))

            :else
            (do (log/info "Agent loop complete"
                          {:iterations iteration
                           ;; TODO: decide if we want this reason to float up to frontend
                           :reason     (finish-reason iteration max-iter parts)})
                (assoc loop-state
                       :status :done
                       :result (rf result' (final-state-part @memory-atom))))))))))

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
        (log/warn e "Failed to write debug log file")))))

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

(def ^:private profile-id->required-permission
  "Map from profile-id to the metabot permission that must be `:yes` for a user
  to use that profile. Profiles not listed here have no profile-level permission gate."
  {:sql                       :permission/metabot-sql-generation
   :nlq                       :permission/metabot-nlq
   :transforms_codegen        :permission/metabot-sql-generation
   :document-generate-content :permission/metabot-other-tools})

(defn- check-metabot-access!
  "Throw a 403 if the user's metabot permissions do not grant access to the
  requested profile. First checks the base metabot on/off permission, then
  the profile-specific permission."
  [profile-id perms]
  ;; Base metabot on/off check — blocks ALL profiles when metabot is disabled
  (api/check (= :yes (:permission/metabot perms))
             [403 "You do not have permission to use the AI assistant."])
  ;; Profile-specific permission check
  (when-let [required-perm (profile-id->required-permission profile-id)]
    (api/check (= :yes (get perms required-perm))
               [403 (format "You do not have permission to use the %s assistant." (name profile-id))])))

(mu/defn run-agent-loop
  "Run agent loop, returning a reducible of parts.

  When `:debug?` is true, binds `*debug-log*` and emits a `debug_log` data part
  at the end of the stream with the complete LLM request/response data for every
  iteration. This is useful for debugging benchmark failures.

  Usage:
    (into [] (run-agent-loop opts))
    (transduce xf rf (run-agent-loop opts))
    (into [] (run-agent-loop (assoc opts :debug? true)))  ;; with debug log"
  [opts :- [:map
            [:messages ::messages]
            [:profile-id ::profile-id]
            [:metabot-id {:optional true} [:maybe :string]]
            [:state {:optional true} [:maybe ::state]]
            [:context {:optional true} [:maybe ::context]]
            [:tracking-opts {:optional true} [:maybe ::tracking-opts]]
            [:debug? {:optional true} [:maybe :boolean]]]]
  (let [profile-id         (:profile-id opts)
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
          (prometheus/inc! :metabase-metabot/agent-requests labels)
          (let [start-ms (u/start-timer)]
            (binding [*debug-log*                              (when debug? (atom []))
                      scope/*current-user-scope*               scopes
                      scope/*current-user-metabot-permissions* perms]
              (try
                (let [agent              (init-agent opts)
                      {result    :result
                       iteration :iteration} (->> (initial-loop-state agent rf init (atom {}))
                                                  (iterate loop-step)
                                                  (drop-while #(= :continue (:status %)))
                                                  first)]
                  (prometheus/observe! :metabase-metabot/agent-iterations labels iteration)
                  ;; Emit debug log as a data part if debug mode was active
                  (if (and debug? (seq @*debug-log*))
                    (rf result (debug-log-part @*debug-log*))
                    result))
                (catch Exception e
                  (prometheus/inc! :metabase-metabot/agent-errors labels)
                  (if (:api-error (ex-data e))
                    (if (:status (ex-data e))
                      (log/errorf "Agent loop API error: %s status=%s provider=%s body=%s"
                                  (ex-message e)
                                  (:status (ex-data e))
                                  (:provider (ex-data e))
                                  (pr-str (:body (ex-data e))))
                      (log/errorf e "Agent loop API error: %s provider=%s"
                                  (ex-message e)
                                  (:provider (ex-data e))))
                    (log/error e "Agent loop error"))
                  (rf init (error-part e)))
                (finally
                  (prometheus/observe! :metabase-metabot/agent-duration-ms labels (u/since-ms start-ms)))))))))))
