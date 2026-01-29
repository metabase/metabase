(ns metabase-enterprise.metabot-v3.agent.core
  "Main agent loop implementation using reducible streaming infrastructure."
  (:require
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.agent.tools :as agent-tools]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; Schemas

(mr/def ::message
  "A single message in the conversation history."
  [:map
   [:role [:enum :user :assistant :system :tool]]
   [:content {:optional true} [:maybe :string]]
   [:tool_calls {:optional true} [:maybe [:sequential :map]]]
   [:tool_call_id {:optional true} [:maybe :string]]])

(mr/def ::messages
  "Sequence of messages in the conversation."
  [:sequential ::message])

(mr/def ::state
  "Agent state containing queries, charts, todos, and transforms."
  [:map
   [:queries {:optional true} [:map-of :string :map]]
   [:charts {:optional true} [:map-of :string :map]]
   [:todos {:optional true} [:sequential :map]]
   [:transforms {:optional true} [:map-of :string :map]]])

(mr/def ::context
  "Context information for the agent."
  [:map-of :keyword :any])

(mr/def ::profile-id
  "Profile identifier keyword."
  [:enum :embedding_next :internal :transforms_codegen :sql :nlq])

(mr/def ::part-type
  "Type of a part emitted by the agent loop."
  [:enum :text :tool-input :tool-output :data :error])

(mr/def ::part
  "A single part emitted by the agent loop."
  [:map
   [:type ::part-type]
   ;; Additional fields vary by type
   ])

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
  (and (< (inc iteration) max-iterations)
       (has-tool-calls? parts)
       (not (has-final-response? parts))))

(defn- finish-reason
  "Determine why the agent loop stopped."
  [iteration max-iterations parts]
  (cond
    (>= (inc iteration) max-iterations) :max-iterations
    (has-final-response? parts)         :final-response
    :else                               :stop))

;;; LLM interaction

(defn- call-llm
  "Call Claude and stream processed parts.

  Uses lite-aisdk-xf for fluid text streaming - emits text chunks immediately
  rather than collecting them into one large part."
  [memory context profile tools]
  (let [model      (:model profile "claude-haiku-4-5")
        system-msg (messages/build-system-message context profile tools)
        input-msgs (messages/build-message-history memory)]
    (log/info "Calling Claude" {:model model :msgs (count input-msgs) :tools (count tools)})
    (eduction (comp (self/tool-executor-xf tools)
                    (self/lite-aisdk-xf))
              (self/claude (cond-> {:model model :input input-msgs :tools (vec tools)}
                             system-msg (assoc :system (:content system-msg)))))))

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
    (fn [mem {:keys [chart-id] :as chart}]
      (memory/store-chart mem chart-id chart)))
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

;;; Main loop

(defn- init-agent
  "Initialize agent state."
  [{:keys [messages state profile-id context]}]
  (let [profile      (or (profiles/get-profile profile-id)
                         (throw (ex-info "Unknown profile" {:profile-id profile-id})))
        capabilities (get context :capabilities #{})
        base-tools   (profiles/get-tools-for-profile profile-id capabilities)
        seeded       (seed-state (or state {}) context)
        memory       (-> (memory/initialize messages seeded context)
                         (memory/load-queries-from-state seeded)
                         (memory/load-charts-from-state seeded)
                         (memory/load-transforms-from-state seeded)
                         (memory/load-todos-from-state seeded))
        memory-atom  (atom memory)
        tools        (agent-tools/wrap-tools-with-state base-tools memory-atom)]
    (log/info "Starting agent" {:profile profile-id
                                :max-iter (:max-iterations profile)
                                :tools (count tools)
                                :msgs (count messages)})
    {:memory-atom memory-atom, :context context, :profile profile, :tools tools}))

(defn- initial-loop-state
  "Create initial loop state from agent config and reduction context."
  [agent rf init]
  {:agent     agent
   :rf        rf
   :result    init
   :iteration 0
   :status    :continue})

(defn- final-state-part [memory]
  {:type :data, :data-type "state", :version 1, :data (memory/get-state memory)})

(defn- error-part [^Exception e]
  {:type :error, :error {:message (.getMessage e), :type (str (type e)), :data (ex-data e)}})

(defn- loop-step
  "Execute one iteration of the agent loop. Returns next loop state.

  Streams parts to the consumer as they arrive while simultaneously accumulating
  them for memory updates and control flow decisions."
  [{:keys [agent rf result iteration] :as loop-state}]
  (let [{:keys [memory-atom context profile tools]} agent
        max-iter   (:max-iterations profile 10)
        parts-atom (atom [])
        ;; Compose: post-process for streaming output, accumulate for later decisions
        xf         (comp (streaming/post-process-xf (get-in @memory-atom [:state :queries] {})
                                                    (get-in @memory-atom [:state :charts] {}))
                         (u/tee-xf parts-atom))
        ;; Stream parts to consumer AND accumulate them simultaneously
        result'    (transduce xf rf result (call-llm @memory-atom context profile tools))
        parts      @parts-atom]
    (log/debug "Iteration" {:n iteration})
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
                        {:iterations (inc iteration)
                         :reason     (finish-reason iteration max-iter parts)})
              (assoc loop-state
                     :status :done
                     :result (rf result' (final-state-part @memory-atom)))))))))

;;; Public API

(mu/defn run-agent-loop
  "Run agent loop, returning a reducible of parts.

  Usage:
    (into [] (run-agent-loop opts))
    (transduce xf rf (run-agent-loop opts))"
  [opts :- [:map
            [:messages ::messages]
            [:profile-id ::profile-id]
            [:state {:optional true} [:maybe ::state]]
            [:context {:optional true} [:maybe ::context]]]]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (try
        (->> (initial-loop-state (init-agent opts) rf init)
             (iterate loop-step)
             (drop-while #(= :continue (:status %)))
             first
             :result)
        (catch Exception e
          (log/error e "Agent loop error")
          (rf init (error-part e)))))))
