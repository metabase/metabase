(ns metabase-enterprise.metabot-v3.agent.tools.todo
  "Todo tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.todo :as todo-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "todo_write"} todo-write-tool
  "Create and manage a structured task list.
  Write or update the todo list with tasks for tracking progress.

  Each todo item must have:
  - id: Unique identifier for the task
  - content: Description of what needs to be done
  - status: One of 'pending', 'in_progress', 'completed', 'cancelled'
  - priority: One of 'high', 'medium', 'low'"
  [{:keys [todos]}
   :- [:map {:closed true}
       [:todos [:sequential [:map {:closed true}
                             [:id :string]
                             [:content :string]
                             [:status [:enum "pending" "in_progress" "completed" "cancelled"]]
                             [:priority [:enum "high" "medium" "low"]]]]]]]
  (try
    (todo-tools/todo-write {:todos todos
                            :memory-atom shared/*memory-atom*})
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to update todo list: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "todo_read"} todo-read-tool
  "Read the current todo list from memory.
  Returns the list of todos that have been created during this conversation."
  [_args :- [:map {:closed true}]]
  (try
    (todo-tools/todo-read {:memory-atom shared/*memory-atom*})
    (catch Exception e
      {:output (str "Failed to read todo list: " (or (ex-message e) "Unknown error"))})))
