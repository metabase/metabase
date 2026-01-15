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
  "Run LLM with messages and tools, return collected parts.
  Uses existing self/claude-raw + transducers for streaming and tool execution."
  [messages tools profile]
  (let [model (get profile :model "claude-sonnet-4-5-20250929")
        ;; TODO: Add temperature support to claude-raw
        ;; temperature (get profile :temperature 0.3)
        ;; Call claude-raw to get SSE stream
        raw-stream (self/claude-raw {:model model
                                     :input messages
                                     :tools (vals tools)})
        ;; Create output channel for processed parts
        out-chan (a/chan 100)]
    ;; Pipeline: raw-stream -> claude->aisdk-xf -> tool-executor-rff -> aisdk-xf -> out-chan
    (a/pipeline 1 out-chan
                (comp self/claude->aisdk-xf
                      (self/tool-executor-rff tools)
                      self/aisdk-xf)
                raw-stream)
    ;; Collect all parts from output channel
    (a/<!! (a/into [] out-chan))))

(defn- build-messages-for-llm
  "Build complete message array for LLM from memory."
  [memory]
  (messages/build-message-history memory))

(defn- stream-parts-to-output
  "Stream parts to output channel."
  [out-chan parts]
  (doseq [part parts]
    (a/>!! out-chan part)))

(defn- finalize-stream
  "Finalize the output stream with final state and close channel."
  [out-chan memory]
  (let [state (memory/get-state memory)]
    ;; Stream final state
    (a/>!! out-chan {:type :data
                     :id (str "state-" (random-uuid))
                     :data state})
    ;; Stream finish message
    (a/>!! out-chan {:type :finish})
    (a/close! out-chan)))

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

          ;; Build message history from memory
          (let [llm-messages (build-messages-for-llm @memory-atom)]

            ;; Call LLM with tools
            (let [parts (run-llm-with-tools llm-messages tools profile)]

              ;; Update memory with this step
              (swap! memory-atom memory/add-step parts)

              ;; Stream parts to output
              (stream-parts-to-output out-chan parts)

              ;; Decide whether to continue
              (if (should-continue? iteration profile parts)
                (recur (inc iteration))
                (do
                  (log/info "Agent loop complete"
                            {:iterations (inc iteration)
                             :reason (cond
                                      (>= iteration (:max-iterations profile)) :max-iterations
                                      (has-text-response? parts) :text-response
                                      :else :no-tool-calls)})
                  (finalize-stream out-chan @memory-atom))))))
        (catch Exception e
          (log/error e "Error in agent loop")
          (a/>! out-chan {:type :error
                          :error {:message (.getMessage e)
                                  :type (str (type e))}})
          (a/close! out-chan))))

    ;; Return output channel immediately
    out-chan))
