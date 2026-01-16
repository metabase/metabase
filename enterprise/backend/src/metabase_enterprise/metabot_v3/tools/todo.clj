(ns metabase-enterprise.metabot-v3.tools.todo
  "Tools for managing todo lists during agent conversations.
  Todos are stored in agent memory and streamed to the frontend via todo_list data parts."
  (:require
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private valid-statuses
  "Valid status values for todo items."
  #{"pending" "in_progress" "completed" "cancelled"})

(def ^:private valid-priorities
  "Valid priority values for todo items."
  #{"high" "medium" "low"})

(defn- validate-todo
  "Validate a single todo item. Throws if invalid."
  [{:keys [id content status priority] :as todo}]
  (when-not (and id (string? id) (seq id))
    (throw (ex-info "Todo item missing required 'id' field"
                    {:agent-error? true :todo todo})))
  (when-not (and content (string? content) (seq content))
    (throw (ex-info "Todo item missing required 'content' field"
                    {:agent-error? true :todo todo})))
  (when-not (contains? valid-statuses status)
    (throw (ex-info (str "Invalid todo status: " status ". Valid statuses: " (pr-str valid-statuses))
                    {:agent-error? true :status status})))
  (when-not (contains? valid-priorities priority)
    (throw (ex-info (str "Invalid todo priority: " priority ". Valid priorities: " (pr-str valid-priorities))
                    {:agent-error? true :priority priority})))
  todo)

(defn- validate-todos
  "Validate all todos. Returns the validated todos vector or throws."
  [todos]
  (when-not (sequential? todos)
    (throw (ex-info "Todos must be an array" {:agent-error? true})))
  (mapv validate-todo todos))

(defn todo-write
  "Write/update the todo list.
  Stores todos in memory and returns a todo_list data part for streaming.

  Parameters:
  - todos: Vector of todo item maps with :id, :content, :status, :priority
  - memory-atom: Atom containing agent memory (injected by wrapper)

  Returns map with:
  - :structured-output - Message for the LLM
  - :data-parts - Vector containing todo_list data part for streaming
  - :instructions - Instructions for the LLM on how to handle the result"
  [{:keys [todos memory-atom]}]
  (log/info "Writing todo list" {:todo-count (count todos)})
  (let [validated-todos (validate-todos todos)]
    ;; Store in memory
    (swap! memory-atom update :state assoc :todos validated-todos)
    (log/debug "Stored todos in memory" {:count (count validated-todos)})
    {:structured-output {:message "Todo list updated successfully."
                         :todo_count (count validated-todos)}
     :data-parts [(streaming/todo-list-part validated-todos)]
     :instructions "The todo list has been updated and is automatically displayed to the user. NEVER repeat or summarize the todo list contents in your response."}))

(defn todo-write-tool
  "Tool handler for todo_write tool."
  [args]
  (try
    (todo-write args)
    (catch Exception e
      (log/error e "Error writing todo list")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to update todo list: " (or (ex-message e) "Unknown error"))}))))

(defn todo-read
  "Read the current todo list from memory.

  Parameters:
  - memory-atom: Atom containing agent memory (injected by wrapper)

  Returns map with:
  - :structured-output - The current todos
  - :instructions - Instructions for the LLM"
  [{:keys [memory-atom]}]
  (let [todos (get-in @memory-atom [:state :todos] [])]
    (log/debug "Reading todos from memory" {:count (count todos)})
    {:structured-output {:todos todos
                         :todo_count (count todos)}
     :instructions "You should call todo_write after reading this todo_list to make any updates."}))

(defn todo-read-tool
  "Tool handler for todo_read tool."
  [args]
  (try
    (todo-read args)
    (catch Exception e
      (log/error e "Error reading todo list")
      {:output (str "Failed to read todo list: " (or (ex-message e) "Unknown error"))})))
