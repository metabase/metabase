(ns metabase-enterprise.metabot-v3.agent.memory
  "Memory and state management for the agent loop.
  Tracks conversation history, tool execution steps, and conversation state.")

(defn initialize
  "Initialize memory from input messages and initial state."
  [messages state]
  {:input-messages messages
   :steps-taken []
   :state (or state {})})

(defn add-step
  "Add a completed agent step to memory.
  A step includes the LLM response parts (text, tool calls, tool results)."
  [memory parts]
  (update memory :steps-taken conj {:parts parts}))

(defn get-state
  "Extract conversation state from memory.
  State includes queries, charts, todos, transforms, etc."
  [memory]
  (:state memory))

(defn update-state
  "Update conversation state with new entities."
  [memory state-updates]
  (update memory :state merge state-updates))

(defn get-steps
  "Get all steps taken by the agent so far."
  [memory]
  (:steps-taken memory))

(defn get-input-messages
  "Get the original input messages."
  [memory]
  (:input-messages memory))

(defn iteration-count
  "Get the number of iterations completed."
  [memory]
  (count (:steps-taken memory)))
