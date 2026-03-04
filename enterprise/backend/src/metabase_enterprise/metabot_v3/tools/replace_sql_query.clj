(ns metabase-enterprise.metabot-v3.tools.replace-sql-query
  "Tool for replacing SQL query content entirely while preserving metadata."
  (:require
   [metabase-enterprise.metabot-v3.tools.sql.common :as metabot-v3.tools.sql.common]
   [metabase-enterprise.metabot-v3.tools.sql.validation :as metabot-v3.tools.sql.validation]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn replace-sql-query :- ::metabot-v3.tools.sql.common/operation-result
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
  [{:keys [query-id sql queries-state]}]
  (log/info "Replacing SQL query" {:query-id query-id :sql-length (count sql)})

  ;; Look up query from in-memory state
  (let [query-id (str query-id)
        query (get queries-state query-id)]
    (when-not query
      (throw (ex-info (tru "Query {0} not found" query-id)
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries-state)})))

    (let [dialect (metabot-v3.tools.sql.validation/query->dialect query)

          {:keys [valid? transpiled-sql] :as validation-result}
          (metabot-v3.tools.sql.validation/validate-sql dialect sql)]
      (merge {:validation-result validation-result}
             (when valid?
               (let [;; Replace the SQL content - handle both formats
                     updated-query (metabot-v3.tools.sql.common/update-query-sql query transpiled-sql)]
                 {:action-result {:query-id      query-id
                                  :query-content transpiled-sql
                                  :query         updated-query
                                  :database      (:database query)}}))))))
