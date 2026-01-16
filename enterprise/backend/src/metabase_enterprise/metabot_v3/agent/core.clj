(ns metabase-enterprise.metabot-v3.agent.core
  "Main agent loop implementation using existing streaming infrastructure from self/*"
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.metabot-v3.agent.links :as links]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.agent.tools :as agent-tools]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

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
     (< iteration max-iterations)
     (has-tool-calls? parts)
     (not (has-final-response? parts)))))

(defn- run-llm-with-tools
  "Run LLM with messages and tools, return channel with collected parts.
  Uses existing self/claude-raw + transducers for streaming and tool execution.
  Returns a channel that will contain either:
  - The collected parts vector on success
  - An exception object on failure (caller should check with instance?)"
  [messages tools profile]
  (let [model (get profile :model "claude-sonnet-4-5-20250929")
        ;; Claude API takes system message separately, not in the messages array
        ;; Extract the system message content and filter it from input messages
        system-msg (first (filter #(= (:role %) "system") messages))
        input-msgs (vec (remove #(= (:role %) "system") messages))]
    (log/info "Calling Claude API"
              {:model model
               :system-msg-present (boolean system-msg)
               :input-msg-count (count input-msgs)
               :input-msgs input-msgs
               :tool-count (count tools)})
    ;; TODO: Add temperature support to claude-raw
    ;; temperature (get profile :temperature 0.3)
    ;; Call claude-raw to get SSE stream, then process in a thread
    ;; NOTE: We use a/thread instead of pipeline because tool-executor-rff
    ;; uses blocking operations (a/<!!) in its completion arity, which
    ;; cannot run in go-block contexts (pipeline uses go-blocks internally)
    (a/thread
      (try
        (let [raw-stream (self/claude-raw (cond-> {:model model
                                                   :input input-msgs
                                                   ;; Pass tools as [name, var] pairs so Claude sees the registry key names
                                                   :tools (vec tools)}
                                            system-msg (assoc :system (:content system-msg))))
              ;; Collect all chunks from the raw stream
              raw-chunks (loop [acc []]
                           (if-let [chunk (a/<!! raw-stream)]
                             (recur (conj acc chunk))
                             acc))]
          ;; Apply transducers synchronously in this thread context
          ;; where blocking operations are safe
          (log/debug "Raw chunks from Claude API"
                     {:count (count raw-chunks)
                      :types (mapv :type raw-chunks)})
          (into [] (comp self/claude->aisdk-xf
                         (self/tool-executor-rff tools)
                         self/aisdk-xf)
                raw-chunks))
        (catch Exception e
          ;; Return exception as value so caller can handle it
          e)))))

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
  (reduce
   (fn [mem part]
     (if-let [structured (get-structured-output (:result part))]
       (if (and (:query-id structured) (:query structured))
         (do
           (log/debug "Storing query in memory" {:query-id (:query-id structured)})
           (memory/remember-query mem (:query-id structured) (:query structured)))
         mem)
       mem))
   memory
   parts))

(defn- extract-charts-from-parts
  "Extract charts from tool output parts and store them in memory.
  Tool results with :structured-output containing :chart-id are stored.
  Charts are identified by having both :chart-id and :query-id (from create-chart-tool).
  Returns updated memory."
  [memory parts]
  (reduce
   (fn [mem part]
     (if-let [structured (get-structured-output (:result part))]
       ;; Chart results have :chart-id and :query-id (from create-chart-tool)
       ;; Distinguish from queries which have :query-id and :query
       (if (and (:chart-id structured) (:query-id structured) (not (:query structured)))
         (do
           (log/debug "Storing chart in memory" {:chart-id (:chart-id structured)
                                                 :query-id (:query-id structured)})
           (memory/store-chart mem (:chart-id structured) structured))
         mem)
       mem))
   memory
   parts))

(defn- extract-reactions-from-parts
  "Extract reactions from tool output parts.
  Tool results may contain :reactions key with actions like :metabot.reaction/redirect.
  Returns a vector of reaction maps."
  [parts]
  (into []
        (comp
         (filter #(= (:type %) :tool-output))
         (mapcat #(get-in % [:result :reactions])))
        parts))

(defn- extract-data-parts-from-results
  "Extract data parts from tool results.
  Tools may return :data-parts in their result (e.g., todo_list, transform_suggestion).
  Returns a vector of data part maps."
  [parts]
  (into []
        (comp
         (filter #(= (:type %) :tool-output))
         (mapcat #(get-in % [:result :data-parts])))
        parts))

(defn- stream-parts-to-output!
  "Stream parts to output channel with link resolution, reaction handling, and data parts.
  - Resolves metabase:// links in text parts using memory state.
  - Extracts reactions from tool outputs and converts them to data parts.
  - Extracts tool-generated data parts (e.g., todo_list, transform_suggestion).
  Must be called from within a go block.
  Returns a channel that completes when all parts are written."
  [out-chan parts memory]
  (a/go
    (let [state (memory/get-state memory)
          queries-state (get state :queries {})
          charts-state (get state :charts {})]
      (log/debug "Processing links with state"
                 {:query-count (count queries-state)
                  :chart-count (count charts-state)})
      ;; Process links in all parts before streaming
      (let [processed-parts (links/process-parts-links parts queries-state charts-state)
            ;; Extract reactions and convert to data parts
            reactions (extract-reactions-from-parts parts)
            reaction-data-parts (streaming/reactions->data-parts reactions)
            ;; Extract tool-generated data parts (e.g., todo_list, transform_suggestion)
            tool-data-parts (extract-data-parts-from-results parts)]
        (log/debug "Extracted reactions and data parts"
                   {:reaction-count (count reactions)
                    :reaction-data-part-count (count reaction-data-parts)
                    :tool-data-part-count (count tool-data-parts)})
        ;; Stream processed parts first
        (doseq [part processed-parts]
          (a/>! out-chan part))
        ;; Then stream reaction data parts (like navigate_to)
        (doseq [data-part reaction-data-parts]
          (a/>! out-chan data-part))
        ;; Then stream tool-generated data parts (like todo_list)
        (doseq [data-part tool-data-parts]
          (a/>! out-chan data-part))))))

(defn- finalize-stream!
  "Finalize the output stream with final state and close channel.
  Must be called from within a go block. Returns a channel that completes when done.

  Parameters:
  - out-chan: Output channel to write to
  - memory: Current memory state
  - finish-reason: Why the agent stopped (\"stop\", \"error\", \"max_iterations\")"
  [out-chan memory finish-reason]
  (a/go
    (let [state (memory/get-state memory)]
      ;; Stream final state using proper data part format
      (a/>! out-chan {:type :data
                      :data-type "state"
                      :version 1
                      :data state})
      ;; Stream finish message with reason
      (a/>! out-chan {:type :finish
                      :finish-reason finish-reason})
      (a/close! out-chan))))

(defn run-agent-loop
  "Main agent loop using existing streaming infrastructure.

  Parameters:
  - messages: Vector of input messages [{:role :user :content \"...\"}]
  - state: Initial conversation state map
  - profile-id: Profile keyword (:metabot-embedding, :metabot-internal, etc.)
  - context: Context map with capabilities, user info, etc.

  Returns: core.async channel that will stream AI SDK v5 formatted parts."
  [{:keys [messages state profile-id context]}]
  (let [profile (profiles/get-profile profile-id)
        _ (when-not profile
            (throw (ex-info "Unknown profile" {:profile-id profile-id})))
        capabilities (get context :capabilities #{})
        base-tools (agent-tools/get-tools-for-profile profile-id capabilities)
        out-chan (a/chan 100)
        ;; Initialize memory and load any existing state (queries, charts, transforms, todos)
        initial-memory (-> (memory/initialize messages state)
                           (memory/load-queries-from-state state)
                           (memory/load-charts-from-state state)
                           (memory/load-transforms-from-state state)
                           (memory/load-todos-from-state state))
        memory-atom (atom initial-memory)
        ;; Wrap state-dependent tools with access to memory
        tools (agent-tools/wrap-tools-with-state base-tools memory-atom)]

    (log/info "Starting agent loop"
              {:profile-id profile-id
               :max-iterations (:max-iterations profile)
               :tool-count (count tools)
               :message-count (count messages)})

    ;; Run agent loop in go block
    (a/go
      (try
        (loop [iteration 0]
          (log/debug "Agent iteration" {:iteration iteration})

          ;; Build message history from memory with system message
          (let [llm-messages (build-messages-for-llm @memory-atom context profile tools)
                ;; Call LLM with tools (returns channel)
                parts-chan (run-llm-with-tools llm-messages tools profile)
                ;; Wait for result (non-blocking in go block)
                ;; Result may be parts vector or an exception
                result (a/<! parts-chan)]

            ;; Check if result is an exception
            (if (instance? Throwable result)
              (throw result)
              (when result
                ;; Update memory with this step and extract queries/charts from tool results
                (log/debug "Parts from LLM iteration"
                           {:part-count (count result)
                            :part-types (mapv :type result)})
                (swap! memory-atom (fn [mem]
                                     (-> mem
                                         (memory/add-step result)
                                         (extract-queries-from-parts result)
                                         (extract-charts-from-parts result))))

                ;; Stream parts to output (wait for completion)
                ;; Pass memory so links can be resolved
                (a/<! (stream-parts-to-output! out-chan result @memory-atom))

                ;; Decide whether to continue
                (if (should-continue? iteration profile result)
                  (recur (inc iteration))
                  (let [finish-reason (cond
                                        (>= (inc iteration) (:max-iterations profile)) "max_iterations"
                                        (has-final-response? result) "final_response"
                                        :else "stop")]
                    (log/info "Agent loop complete"
                              {:iterations (inc iteration)
                               :finish-reason finish-reason})
                    (a/<! (finalize-stream! out-chan @memory-atom finish-reason))))))))
        (catch Exception e
          (log/error e "Error in agent loop")
          (a/>! out-chan {:type :error
                          :error {:message (.getMessage e)
                                  :type (str (type e))}})
          (a/close! out-chan))))

    ;; Return output channel immediately
    out-chan))
