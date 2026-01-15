(ns metabase-enterprise.metabot-v3.agent.core
  "Main agent loop implementation using existing streaming infrastructure from self/*"
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.metabot-v3.agent.memory :as memory]
   [metabase-enterprise.metabot-v3.agent.messages :as messages]
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]
   [metabase-enterprise.metabot-v3.agent.tools :as agent-tools]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- has-tool-calls?
  "Check if any parts contain tool calls."
  [parts]
  (some #(= (:type %) :tool-input) parts))

(defn- has-text-response?
  "Check if any parts contain text responses."
  [parts]
  (some #(= (:type %) :text) parts))

(defn- should-continue?
  "Determine if agent should continue iterating.
  Stops if:
  - Max iterations reached
  - LLM responded with text (final response)
  - No tool calls made"
  [iteration profile parts]
  (let [max-iterations (get profile :max-iterations 10)]
    (and
     (< iteration max-iterations)
     (not (has-text-response? parts))
     (has-tool-calls? parts))))

(defn- run-llm-with-tools
  "Run LLM with messages and tools, return channel with collected parts.
  Uses existing self/claude-raw + transducers for streaming and tool execution.
  Returns a channel that will contain either:
  - The collected parts vector on success
  - An exception object on failure (caller should check with instance?)"
  [messages tools profile]
  (let [model (get profile :model "claude-sonnet-4-5-20250929")]
    ;; TODO: Add temperature support to claude-raw
    ;; temperature (get profile :temperature 0.3)
    ;; Call claude-raw to get SSE stream, then process in a thread
    ;; NOTE: We use a/thread instead of pipeline because tool-executor-rff
    ;; uses blocking operations (a/<!!) in its completion arity, which
    ;; cannot run in go-block contexts (pipeline uses go-blocks internally)
    (a/thread
      (try
        (let [raw-stream (self/claude-raw {:model model
                                           :input messages
                                           :tools (vals tools)})
              ;; Collect all chunks from the raw stream
              raw-chunks (loop [acc []]
                           (if-let [chunk (a/<!! raw-stream)]
                             (recur (conj acc chunk))
                             acc))]
          ;; Apply transducers synchronously in this thread context
          ;; where blocking operations are safe
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
        history (messages/build-message-history memory)]
    (cons system-msg history)))

(defn- stream-parts-to-output!
  "Stream parts to output channel. Must be called from within a go block.
  Returns a channel that completes when all parts are written."
  [out-chan parts]
  (a/go
    (doseq [part parts]
      (a/>! out-chan part))))

(defn- finalize-stream!
  "Finalize the output stream with final state and close channel.
  Must be called from within a go block. Returns a channel that completes when done."
  [out-chan memory]
  (a/go
    (let [state (memory/get-state memory)]
      ;; Stream final state
      (a/>! out-chan {:type :data
                      :id (str "state-" (random-uuid))
                      :data state})
      ;; Stream finish message
      (a/>! out-chan {:type :finish})
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
        tools (agent-tools/get-tools-for-profile profile-id capabilities)
        out-chan (a/chan 100)
        memory-atom (atom (memory/initialize messages state))]

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
                ;; Update memory with this step
                (swap! memory-atom memory/add-step result)

                ;; Stream parts to output (wait for completion)
                (a/<! (stream-parts-to-output! out-chan result))

                ;; Decide whether to continue
                (if (should-continue? iteration profile result)
                  (recur (inc iteration))
                  (do
                    (log/info "Agent loop complete"
                              {:iterations (inc iteration)
                               :reason (cond
                                         (>= iteration (:max-iterations profile)) :max-iterations
                                         (has-text-response? result) :text-response
                                         :else :no-tool-calls)})
                    (a/<! (finalize-stream! out-chan @memory-atom))))))))
        (catch Exception e
          (log/error e "Error in agent loop")
          (a/>! out-chan {:type :error
                          :error {:message (.getMessage e)
                                  :type (str (type e))}})
          (a/close! out-chan))))

    ;; Return output channel immediately
    out-chan))
