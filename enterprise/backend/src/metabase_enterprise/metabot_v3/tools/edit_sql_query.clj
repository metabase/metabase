(ns metabase-enterprise.metabot-v3.tools.edit-sql-query
  "Tool for editing existing SQL queries."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- extract-sql-content
  "Extract SQL content from a dataset_query map.
  Handles both legacy format and lib/query format."
  [query]
  (or
   ;; Try lib/query format (with stages)
   (get-in query [:stages 0 :native])
   ;; Try legacy format
   (get-in query [:native :query])))

(defn- update-query-sql
  "Update a dataset_query map with new SQL content."
  [query new-sql]
  (cond
    (get-in query [:stages])
    (assoc-in query [:stages 0 :native] new-sql)

    (get-in query [:native])
    (assoc-in query [:native :query] new-sql)

    :else
    (throw (ex-info (tru "Unsupported query format")
                    {:agent-error? true}))))

(defn- apply-sql-edit
  "Apply a targeted string replacement to SQL content."
  [sql {:keys [old_string new_string replace_all]}]
  (when-not (and (string? old_string) (string? new_string))
    (throw (ex-info (tru "Each edit must include old_string and new_string")
                    {:agent-error? true})))
  (let [pattern (re-pattern (java.util.regex.Pattern/quote old_string))
        occurrences (count (re-seq pattern sql))]
    (cond
      (zero? occurrences)
      (throw (ex-info (tru "Text to replace not found: {0}" old_string)
                      {:agent-error? true
                       :old old_string}))

      (and (> occurrences 1) (not replace_all))
      (throw (ex-info (tru "Text to replace found multiple times: {0}" old_string)
                      {:agent-error? true
                       :old old_string
                       :occurrences occurrences}))

      replace_all
      (str/replace sql old_string new_string)

      :else
      (str/replace-first sql old_string new_string))))

(defn edit-sql-query
  "Edit an existing SQL query from in-memory state.

  Parameters:
  - query-id: ID of the query to edit
  - edit: Edit specification map (see apply-sql-edit for format)
  - name: New name for the query (optional)
  - description: New description for the query (optional)

  Returns a map with:
  - :query-id - The ID of the updated query
  - :query-content - The updated SQL content
  - :database - Database ID"
  [{:keys [query-id edits queries-state name description]}]
  (log/info "Editing SQL query" {:query-id query-id :edit-count (count edits)})

  ;; Look up query from in-memory state
  (let [query-id (str query-id)
        query (get queries-state query-id)]
    (when-not query
      (throw (ex-info (tru "Query {0} not found" query-id)
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries-state)})))

    (let [current-sql (extract-sql-content query)]
      (when-not current-sql
        (throw (ex-info (tru "Query {0} is not a SQL query" query-id)
                        {:agent-error? true
                         :query-id query-id})))

      ;; Apply edits sequentially
      (let [new-sql (reduce apply-sql-edit current-sql edits)
            updated-query (update-query-sql query new-sql)]
        {:query-id      query-id
         :query-content new-sql
         :query         updated-query
         :database      (:database query)}))))

(defn edit-sql-query-tool
  "Tool handler for edit_sql_query tool.
  Returns structured output with updated query details and a navigate_to data part."
  [args]
  (try
    (let [result (edit-sql-query args)
          results-url (streaming/query->question-url (:query result))]
      {:structured-output result
       :instructions instructions/query-created-instructions
       :data-parts [(streaming/navigate-to-part results-url)]})
    (catch Exception e
      (log/error e "Error editing SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to edit SQL query: " (or (ex-message e) "Unknown error"))}))))
