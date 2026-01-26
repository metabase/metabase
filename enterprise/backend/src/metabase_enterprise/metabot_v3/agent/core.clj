(ns metabase-enterprise.metabot-v3.agent.core
  "Main agent loop implementation using existing streaming infrastructure from self/*"
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.agent.tools :as agent-tools]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn collect!
  "Blocking collect of channel into vector."
  ([ch] (a/<!! (a/into [] ch)))
  ([xf ch] (a/<!! (a/transduce xf conj [] ch))))

(defn- has-tool-calls?
  "Check if any parts contain tool calls."
  [parts]
  (some #(= (:type %) :tool-input) parts))

(defn- has-final-response?
  "Check if any tool result signals a final response.
  Some tools (like ask_for_sql_clarification) return :final-response? true
  to indicate the agent should stop and wait for user input."
  [parts]
  (some (fn [part]
          (and (= (:type part) :tool-output)
               (get-in part [:result :final-response?])))
        parts))

(defn- should-continue?
  "Determine if agent should continue iterating.
  Stops if:
  - Max iterations reached
  - No tool calls made (text-only response is final answer)
  - A tool signals final response (e.g., ask_for_sql_clarification)

  Note: LLM may output text alongside tool calls (e.g., 'I'll search for that...').
  We continue as long as there are tool calls to process and no final response."
  [iteration profile parts]
  (let [max-iterations (get profile :max-iterations 10)]
    (and
     (< (inc iteration) max-iterations)
     (has-tool-calls? parts)
     (not (has-final-response? parts)))))

(defn- llm-parts-xf
  "Transducer that transforms raw Claude SSE chunks into processed parts.
  Composes: claude->aisdk-xf -> tool-executor-rff -> aisdk-xf"
  [tools]
  (comp self/claude->aisdk-xf
        (self/tool-executor-rff tools)
        self/aisdk-xf))

(defn- call-llm
  "Call Claude API and return raw SSE channel.
  Returns a core.async channel of raw Claude SSE events."
  [messages tools profile]
  (let [model      (get profile :model "claude-haiku-4-5")
        ;; Claude API takes system message separately, not in the messages array
        system-msg (first (filter #(= (:role %) "system") messages))
        input-msgs (vec (remove #(= (:role %) "system") messages))]
    (log/info "Calling Claude API"
              {:model              model
               :system-msg-present (boolean system-msg)
               :input-msg-count    (count input-msgs)
               :tool-count         (count tools)})
    ;; TODO: Add temperature support to claude-raw
    (self/claude-raw (cond-> {:model model
                              :input input-msgs
                              :tools (vec tools)}
                       system-msg (assoc :system (:content system-msg))))))

(defn- build-messages-for-llm
  "Build complete message array for LLM from memory, context, profile, and tools.
  Prepends system message with enriched context."
  [memory context profile tools]
  (let [system-msg (messages/build-system-message context profile tools)
        history (messages/build-message-history memory)
        result (into [system-msg] history)]
    (log/debug "Built messages for LLM"
               {:system-msg-length (count (:content system-msg))
                :history-count (count history)
                :total-messages (count result)
                :message-roles (mapv :role result)
                :messages-preview (mapv #(select-keys % [:role :content]) result)})
    result))

(defn- get-structured-output
  "Extract structured output from result, handling both key formats.
  Tools may use :structured-output (hyphen, Clojure idiomatic) or
  :structured_output (underscore, from JSON/API responses)."
  [result]
  (or (:structured-output result)
      (:structured_output result)))

(defn- extract-queries-from-parts
  "Extract queries from tool output parts and store them in memory.
  Tool results with :structured-output containing :query-id and :query are stored.
  Returns updated memory."
  [memory parts]
  (transduce
   (comp
    (map #(get-structured-output (:result %)))
    (filter #(and (:query-id %) (:query %))))
   (fn
     ([mem] mem)
     ([mem {:keys [query-id query]}]
      (log/debug "Storing query in memory" {:query-id query-id})
      (memory/remember-query mem query-id query)))
   memory
   parts))

(defn- extract-charts-from-parts
  "Extract charts from tool output parts and store them in memory.
  Tool results with :structured-output containing :chart-id are stored.
  Charts are identified by having both :chart-id and :query-id (from create-chart-tool).
  Returns updated memory."
  [memory parts]
  (transduce
   (comp
    (map #(get-structured-output (:result %)))
    (filter #(and (:chart-id %) (:query-id %))))
   (fn
     ([mem] mem)
     ([mem {:keys [chart-id query-id] :as structured}]
      (log/debug "Storing chart in memory" {:chart-id chart-id
                                            :query-id query-id})
      (memory/store-chart mem chart-id structured)))
   memory
   parts))

(defn- normalize-context-type
  "Normalize context :type to lowercase string."
  [type-val]
  (cond
    (keyword? type-val) (name type-val)
    (string? type-val) type-val
    (nil? type-val) nil
    :else (str type-val)))

(defn- extract-query-from-viewing-item
  "Extract [query-id query] from a viewing context item when possible.
  Mirrors ai-service behavior for adhoc/native queries and transforms with query sources."
  [item]
  (let [item-type (normalize-context-type (:type item))]
    (cond
      (and (#{"adhoc" "native"} item-type)
           (map? (:query item))
           (:id item))
      [(str (:id item)) (:query item)]

      (and (= "transform" item-type)
           (= "query" (normalize-context-type (get-in item [:source :type])))
           (map? (get-in item [:source :query]))
           (:id item))
      [(str (:id item)) (get-in item [:source :query])]

      :else
      nil)))

(defn- seed-state-from-context
  "Seed initial state with queries derived from user_is_viewing context."
  [state context]
  (reduce (fn [state* item]
            (let [[query-id query] (extract-query-from-viewing-item item)]
              (cond-> state*
                query-id (assoc-in [:queries query-id] query))))
          state
          (:user_is_viewing context)))

(defn- stream-parts!
  "Stream parts through reducing function with link resolution, reaction handling, and data parts.
  Uses streaming/post-process-xf transducer to:
  - Expand reactions from tool outputs into data parts
  - Expand data-parts from tool outputs
  - Resolve metabase:// links in text parts using memory state

  Note: Uses reduce (not transduce) to avoid calling the completion arity of rf.
  The completion arity should only be called once at the very end via finalize-stream!.

  Returns the accumulated result."
  [rf result parts memory]
  (let [state         (memory/get-state memory)
        queries-state (get state :queries {})
        charts-state  (get state :charts {})]
    (log/debug "Processing parts with post-process-xf"
               {:query-count (count queries-state)
                :chart-count (count charts-state)
                :part-count  (count parts)})
    ;; Apply post-process-xf to parts, then reduce through rf
    ;; We use sequence + reduce instead of transduce to avoid calling rf's completion arity
    (reduce rf result (sequence (streaming/post-process-xf queries-state charts-state) parts))))

(defn- finalize-stream!
  "Finalize the output stream with final state.

  Parameters:
  - rf: Reducing function for output
  - result: Current accumulated result
  - memory: Current memory state
  - finish-reason: Why the agent stopped (\"stop\", \"error\", \"max_iterations\")

  Returns the final accumulated result after completion arity is called.

  Note: We don't emit a :finish part here because aisdk-line-xf handles emitting
  the finish line (with accumulated usage) in its completion arity."
  [rf result memory _finish-reason]
  (let [state (memory/get-state memory)]
    ;; Stream final state using proper data part format
    (-> result
        (rf {:type      :data
             :data-type "state"
             :version   1
             :data      state})
        rf))) ;; call completion arity - this triggers aisdk-line-xf to emit finish

(defn run-agent-loop
  "Main agent loop using existing streaming infrastructure.

  Parameters:
  - messages: Vector of input messages [{:role :user :content \"...\"}]
  - state: Initial conversation state map
  - profile-id: Profile keyword (:metabot-embedding, :metabot-internal, etc.)
  - context: Context map with capabilities, user info, etc.
  - rf: Reducing function that receives AI SDK v5 formatted parts.
        Called with (rf) for init, (rf result part) for each part,
        and (rf result) for completion.

  Runs synchronously in the calling thread. Returns the final reduced result."
  [{:keys [messages state profile-id context]} rf]
  (let [profile        (profiles/get-profile profile-id)
        _              (when-not profile
                         (throw (ex-info "Unknown profile" {:profile-id profile-id})))
        capabilities   (get context :capabilities #{})
        base-tools     (profiles/get-tools-for-profile profile-id capabilities)
        seeded-state   (seed-state-from-context (or state {}) context)
        ;; Initialize memory and load any existing state (queries, charts, transforms, todos)
        initial-memory (-> (memory/initialize messages seeded-state context)
                           (memory/load-queries-from-state seeded-state)
                           (memory/load-charts-from-state seeded-state)
                           (memory/load-transforms-from-state seeded-state)
                           (memory/load-todos-from-state seeded-state))
        memory-atom    (atom initial-memory)
        ;; Wrap state-dependent tools with access to memory
        tools          (agent-tools/wrap-tools-with-state base-tools memory-atom)]

    (log/info "Starting agent loop"
              {:profile-id     profile-id
               :max-iterations (:max-iterations profile)
               :tool-count     (count tools)
               :message-count  (count messages)})

    (try
      (loop [iteration 0
             result    (rf)]
        (log/debug "Agent iteration" {:iteration iteration})

        ;; Build message history from memory with system message
        (let [llm-messages (build-messages-for-llm @memory-atom context profile tools)
              ;; Call LLM and collect all parts (blocks until complete)
              raw-stream   (call-llm llm-messages tools profile)
              parts        (collect! (llm-parts-xf tools) raw-stream)]

          (if-not parts
            ;; No result - finalize
            (finalize-stream! rf result @memory-atom "stop")
            ;; Process parts
            (do
              ;; Update memory with this step and extract queries/charts from tool results
              (log/debug "Parts from LLM iteration"
                         {:part-count (count parts)
                          :part-types (mapv :type parts)})
              (swap! memory-atom (fn [mem]
                                   (-> mem
                                       (memory/add-step parts)
                                       (extract-queries-from-parts parts)
                                       (extract-charts-from-parts parts))))

              ;; Stream parts through rf
              (let [result' (stream-parts! rf result parts @memory-atom)]
                ;; Decide whether to continue
                (if (should-continue? iteration profile parts)
                  (recur (inc iteration) result')
                  (let [finish-reason (cond
                                        (>= (inc iteration) (:max-iterations profile)) "max_iterations"
                                        (has-final-response? parts)                    "final_response"
                                        :else                                          "stop")]
                    (log/info "Agent loop complete"
                              {:iterations    (inc iteration)
                               :finish-reason finish-reason})
                    (finalize-stream! rf result' @memory-atom finish-reason))))))))
      (catch Exception e
        (log/error e "Error in agent loop")
        (-> (rf)
            (rf {:type  :error
                 :error {:message (.getMessage e)
                         :type    (str (type e))
                         :data    (ex-data e)}})
            rf)))))
