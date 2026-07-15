(ns metabase.metabot.agent.memory
  "Memory and state management for the agent loop.
  Tracks conversation history, tool execution steps, and conversation state.

  `:state` is the live working state readers see — the incoming baseline (prior
  turns merged, plus seeded viewing context) with this turn's writes applied.
  `:turn-state` accumulates *only* what this turn wrote, and is what gets
  persisted to `metabot_message.state`; readers never touch it. Writers record
  into both."
  (:require
   [clojure.string :as str]
   [metabase.metabot.schema :as metabot.schema]))

(defn merge-states
  "Merge two partial states. Map entries (e.g. :queries) merge entry-wise;
  scalar/vector entries (e.g. :todos) take the later value."
  [a b]
  (merge-with (fn [x y] (if (every? map? [x y]) (merge x y) y)) a b))

(defn initialize
  "Initialize memory from input messages and the incoming baseline `state` (prior
  turns merged, plus seeded viewing context)."
  ([messages state]
   (initialize messages state nil))
  ([messages state context]
   {:input-messages messages
    :steps-taken    []
    :context        context
    :state          (metabot.schema/normalize-state
                     (or state {:queries {} :charts {} :todos [] :transforms {} :link-registry {}}))
    :turn-state     {}}))

(defn add-step
  "Add a completed agent step to memory.
  A step includes the LLM response parts (text, tool calls, tool results)."
  [memory parts]
  (update memory :steps-taken conj {:parts parts}))

(defn- record
  "Write `v` at `path` into both the live working `:state` and this turn's
  `:turn-state` delta. Readers see it via `:state`; persistence keeps `:turn-state`."
  [memory path v]
  (-> memory
      (assoc-in (into [:state] path) v)
      (assoc-in (into [:turn-state] path) v)))

(defn get-state
  "The agent's current full working state."
  [memory]
  (:state memory))

(defn turn-state
  "Only this turn's state writes, or nil if the turn produced none. Persisted to
  `metabot_message.state`; [[metabase.metabot.persistence/conversation-state]]
  merges these across a conversation's rows to reconstruct the baseline."
  [memory]
  (not-empty (:turn-state memory)))

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

(defn set-query
  "Store a query in state by its query-id.
  Query should be an MBQL 4 (legacy) or MBQL 5 query map."
  [memory query-id query]
  (record memory [:queries query-id] query))

(defn find-query
  "Retrieve a query by its query-id. Throws if not found."
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

;;; Chart Management

(defn set-chart
  "Store a chart configuration in state by its chart-id."
  [memory chart-id chart]
  (record memory [:charts chart-id] chart))

(defn find-chart
  "Retrieve a chart by its chart-id. Throws if not found."
  [memory chart-id]
  (let [charts (get-in memory [:state :charts] {})]
    (if-let [chart (get charts chart-id)]
      chart
      (throw (ex-info (str "Chart with ID " chart-id " not found in memory. "
                           "Available charts: [" (str/join ", " (keys charts)) "]")
                      {:agent-error? true
                       :chart-id chart-id
                       :available-charts (keys charts)})))))

;;; Transform Management

(defn set-transform
  "Store a transform in state by its ID."
  [memory transform-id transform]
  (record memory [:transforms (str transform-id)] transform))

(defn find-transform
  "Retrieve a transform by its ID. Throws if not found."
  [memory transform-id]
  (let [transforms (get-in memory [:state :transforms] {})]
    (if-let [transform (get transforms (str transform-id))]
      transform
      (throw (ex-info (str "Transform with ID " transform-id " not found in memory. "
                           "Available transforms: [" (str/join ", " (keys transforms)) "]")
                      {:agent-error? true
                       :transform-id transform-id
                       :available-transforms (keys transforms)})))))

;;; Todos & link registry (whole-value writes)

(defn set-todos
  "Set the todo list (a vector of todo item maps)."
  [memory todos]
  (record memory [:todos] (vec todos)))

(defn set-link-registry
  "Set the link registry (url → stable id mappings)."
  [memory link-registry]
  (if (= (get-in memory [:state :link-registry] {}) link-registry)
    memory
    (record memory [:link-registry] link-registry)))
