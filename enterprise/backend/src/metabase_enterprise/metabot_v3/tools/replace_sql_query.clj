(ns metabase-enterprise.metabot-v3.tools.replace-sql-query
  "Tool for replacing SQL query content entirely while preserving metadata."
  (:require
   [metabase.api.common :as api]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- get-query-card
  "Fetch a query card and validate access."
  [query-id]
  (let [card (t2/select-one :model/Card :id query-id)]
    (when-not card
      (throw (ex-info (tru "Query {0} not found" query-id)
                      {:agent-error? true
                       :query-id query-id})))
    (api/write-check card)
    card))

(defn replace-sql-query
  "Replace the SQL content of an existing query while preserving metadata.

  This is different from edit-sql-query in that it completely replaces the SQL
  rather than applying specific edits. Useful for refactoring or complete rewrites.

  Parameters:
  - query-id: ID of the query to replace
  - sql: New SQL query string
  - name: New name for the query (optional, preserves existing if not provided)
  - description: New description (optional, preserves existing if not provided)

  Returns a map with:
  - :query-id - The ID of the updated query
  - :query-content - The new SQL content
  - :database - Database ID"
  [{:keys [query-id sql name description]}]
  (log/info "Replacing SQL query" {:query-id query-id :sql-length (count sql)})

  ;; Get and validate card
  (let [card (get-query-card query-id)
        ;; Check if this is a SQL query (handle both lib/query format and legacy format)
        is-sql? (or (get-in card [:dataset_query :stages 0 :native])
                    (get-in card [:dataset_query :native :query]))]

    (when-not is-sql?
      (throw (ex-info (tru "Query {0} is not a SQL query" query-id)
                      {:agent-error? true
                       :query-id query-id})))

    ;; Replace the SQL content - handle both formats
    (let [updated-query (if (get-in card [:dataset_query :stages])
                          (assoc-in (:dataset_query card) [:stages 0 :native] sql)
                          (assoc-in (:dataset_query card) [:native :query] sql))
          updates (cond-> {:dataset_query updated-query}
                    name (assoc :name name)
                    description (assoc :description description))]

      ;; Update the card
      (t2/update! :model/Card query-id updates)

      (log/info "Replaced SQL query content" {:card-id query-id})

      {:query-id      query-id
       :query-content sql
       :database      (:database_id card)})))

(defn replace-sql-query-tool
  "Tool handler for replace_sql_query tool.
  Returns structured output with updated query details."
  [args]
  (try
    (let [result (replace-sql-query args)]
      {:structured-output result})
    (catch Exception e
      (log/error e "Error replacing SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to replace SQL query: " (or (ex-message e) "Unknown error"))}))))
