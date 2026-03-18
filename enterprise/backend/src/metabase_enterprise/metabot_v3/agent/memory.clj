(ns metabase-enterprise.metabot-v3.agent.memory
  "Memory and state management for the agent loop.
  Tracks conversation history, tool execution steps, and conversation state."
  (:require
   [clojure.string :as str]))

(defn initialize
  "Initialize memory from input messages and initial state.
  State structure:
  {:queries {query-id query-map}
   :charts {chart-id chart-map}
   :todos [...]
   :transforms {...}}"
  ([messages state]
   (initialize messages state nil))
  ([messages state context]
   {:input-messages messages
    :steps-taken []
    :context context
    :state (or state {:queries {} :charts {} :todos [] :transforms {}})}))

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

;;; Query Management

(defn remember-query
  "Store a query in memory state by its query-id.
  Query should be an MBQL/MLv2 query map."
  [memory query-id query]
  (update-in memory [:state :queries] assoc query-id query))

(defn find-query
  "Retrieve a query from memory state by its query-id.
  Throws if query not found."
  [memory query-id]
  (let [queries (get-in memory [:state :queries] {})]
    (if-let [query (get queries query-id)]
      query
      (throw (ex-info (str "Query with ID " query-id " not found in memory. "
                           "Available queries: [" (str/join ", " (keys queries)) "]. "
                           "Are you sure you were referring to a query ID?")
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries)})))))

(defn get-queries
  "Get all stored queries from memory state."
  [memory]
  (get-in memory [:state :queries] {}))

;;; Chart Management

(defn store-chart
  "Store a chart configuration in memory state by its chart-id."
  [memory chart-id chart]
  (update-in memory [:state :charts] assoc chart-id chart))

(defn find-chart
  "Retrieve a chart from memory state by its chart-id.
  Throws if chart not found."
  [memory chart-id]
  (let [charts (get-in memory [:state :charts] {})]
    (if-let [chart (get charts chart-id)]
      chart
      (throw (ex-info (str "Chart with ID " chart-id " not found in memory. "
                           "Available charts: [" (str/join ", " (keys charts)) "]")
                      {:agent-error? true
                       :chart-id chart-id
                       :available-charts (keys charts)})))))

(defn get-charts
  "Get all stored charts from memory state."
  [memory]
  (get-in memory [:state :charts] {}))

;;; Transform Management

(defn remember-transform
  "Store a transform in memory state by its ID."
  [memory transform-id transform]
  (update-in memory [:state :transforms] assoc (str transform-id) transform))

(defn find-transform
  "Retrieve a transform from memory by its ID.
  Throws if transform not found."
  [memory transform-id]
  (let [transforms (get-in memory [:state :transforms] {})]
    (if-let [transform (get transforms (str transform-id))]
      transform
      (throw (ex-info (str "Transform with ID " transform-id " not found in memory. "
                           "Available transforms: [" (str/join ", " (keys transforms)) "]")
                      {:agent-error? true
                       :transform-id transform-id
                       :available-transforms (keys transforms)})))))

(defn get-transforms
  "Get all stored transforms from memory state."
  [memory]
  (get-in memory [:state :transforms] {}))

;;; Todo Management

(defn set-todos
  "Set the todo list in memory state.
  Todos should be a vector of todo item maps."
  [memory todos]
  (assoc-in memory [:state :todos] (vec todos)))

(defn get-todos
  "Get the current todo list from memory state."
  [memory]
  (get-in memory [:state :todos] []))

;;; State Loading

(defn load-queries-from-state
  "Load queries from incoming state into memory."
  [memory state]
  (if-let [queries (:queries state)]
    (reduce-kv remember-query memory queries)
    memory))

(defn load-charts-from-state
  "Load charts from incoming state into memory."
  [memory state]
  (if-let [charts (:charts state)]
    (reduce-kv store-chart memory charts)
    memory))

(defn load-transforms-from-state
  "Load transforms from incoming state into memory."
  [memory state]
  (if-let [transforms (:transforms state)]
    (reduce-kv remember-transform memory transforms)
    memory))

(defn load-todos-from-state
  "Load todos from incoming state into memory."
  [memory state]
  (if-let [todos (:todos state)]
    (set-todos memory todos)
    memory))
