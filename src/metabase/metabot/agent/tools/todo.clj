(ns metabase.metabot.agent.tools.todo
  "Todo tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase.metabot.agent.tools.shared :as shared]
   [metabase.metabot.tools.todo :as todo-tools]))

(set! *warn-on-reflection* true)

(defn- format-todo-write-output
  [{:keys [todo_count]}]
  (str "Todo list updated successfully. " todo_count " item(s)."))

(defn- format-todo-read-output
  [{:keys [todos todo_count]}]
  (if (seq todos)
    (str "Current todo list (" todo_count " items):\n"
         (str/join "\n" (map (fn [{:keys [id content status priority]}]
                               (str "- [" status "] " content " (id=" id ", priority=" priority ")"))
                             todos)))
    "No todos found."))

(defn- add-output
  [result format-fn]
  (if-let [structured (:structured-output result)]
    (assoc result :output (format-fn structured))
    result))

(def ^:private todo-write-schema
  [:map {:closed true}
   [:todos [:sequential [:map {:closed true}
                         [:id :string]
                         [:content :string]
                         [:status [:enum "pending" "in_progress" "completed" "cancelled"]]
                         [:priority [:enum "high" "medium" "low"]]]]]])

(defn todo-write-tool "todo-write-tool" []
  {:tool-name "todo_write"
   :doc       "Create and manage a structured task list.
  Write or update the todo list with tasks for tracking progress.

  Each todo item must have:
  - id: Unique identifier for the task
  - content: Description of what needs to be done
  - status: One of 'pending', 'in_progress', 'completed', 'cancelled'
  - priority: One of 'high', 'medium', 'low'"
   :schema    [:=> [:cat todo-write-schema] :any]
   :fn        (fn [{:keys [todos]}]
                (try
                  (add-output
                   (todo-tools/todo-write {:todos todos
                                           :memory-atom shared/*memory-atom*})
                   format-todo-write-output)
                  (catch Exception e
                    (if (:agent-error? (ex-data e))
                      {:output (ex-message e)}
                      {:output (str "Failed to update todo list: " (or (ex-message e) "Unknown error"))}))))})

(defn todo-read-tool "todo-read-tool" []
  {:tool-name "todo_read"
   :doc       "Read the current todo list from memory.
  Returns the list of todos that have been created during this conversation."
   :schema    [:=> [:cat [:maybe [:map {:closed true}]]] :any]
   :fn        (fn [_args]
                (try
                  (add-output
                   (todo-tools/todo-read {:memory-atom shared/*memory-atom*})
                   format-todo-read-output)
                  (catch Exception e
                    {:output (str "Failed to read todo list: " (or (ex-message e) "Unknown error"))})))})
