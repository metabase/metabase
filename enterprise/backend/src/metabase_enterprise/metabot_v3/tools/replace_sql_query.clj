(ns metabase-enterprise.metabot-v3.tools.replace-sql-query
  "Tool for replacing SQL query content entirely while preserving metadata."
  (:require
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- update-query-sql
  "Update a dataset_query map with new SQL content."
  [query new-sql]
  (cond
    (get-in query [:stages])
    (assoc-in query [:stages 0 :native] new-sql)

    (get-in query [:native])
    (assoc-in query [:native :query] new-sql)

    :else
    (throw (ex-info (tru "Query is not a SQL query")
                    {:agent-error? true}))))

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
  [{:keys [query-id sql queries-state name description]}]
  (log/info "Replacing SQL query" {:query-id query-id :sql-length (count sql)})

  ;; Look up query from in-memory state
  (let [query-id (str query-id)
        query (get queries-state query-id)]
    (when-not query
      (throw (ex-info (tru "Query {0} not found" query-id)
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries-state)})))

    ;; Replace the SQL content - handle both formats
    (let [updated-query (update-query-sql query sql)]
      {:query-id      query-id
       :query-content sql
       :query         updated-query
       :database      (:database query)})))
