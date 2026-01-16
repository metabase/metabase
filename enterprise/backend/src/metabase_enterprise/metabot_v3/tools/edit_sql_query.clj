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
  "Apply an edit to SQL content.

  Edit can be:
  - {:type :replace :old <string> :new <string>} - Replace first occurrence
  - {:type :replace-all :old <string> :new <string>} - Replace all occurrences
  - {:type :append :text <string>} - Append to end
  - {:type :prepend :text <string>} - Prepend to start
  - {:type :insert-after :marker <string> :text <string>} - Insert after marker
  - {:type :insert-before :marker <string> :text <string>} - Insert before marker"
  [sql edit]
  (case (:type edit)
    :replace
    (let [{:keys [old new]} edit]
      (when-not (str/includes? sql old)
        (throw (ex-info (tru "Text to replace not found: {0}" old)
                        {:agent-error? true
                         :old old})))
      (str/replace-first sql old new))

    :replace-all
    (let [{:keys [old new]} edit]
      (when-not (str/includes? sql old)
        (throw (ex-info (tru "Text to replace not found: {0}" old)
                        {:agent-error? true
                         :old old})))
      (str/replace sql old new))

    :append
    (str sql "\n" (:text edit))

    :prepend
    (str (:text edit) "\n" sql)

    :insert-after
    (let [{:keys [marker text]} edit]
      (when-not (str/includes? sql marker)
        (throw (ex-info (tru "Marker not found: {0}" marker)
                        {:agent-error? true
                         :marker marker})))
      (str/replace-first sql marker (str marker "\n" text)))

    :insert-before
    (let [{:keys [marker text]} edit]
      (when-not (str/includes? sql marker)
        (throw (ex-info (tru "Marker not found: {0}" marker)
                        {:agent-error? true
                         :marker marker})))
      (str/replace-first sql marker (str text "\n" marker)))

    (throw (ex-info (tru "Unknown edit type: {0}" (:type edit))
                    {:agent-error? true
                     :type (:type edit)}))))

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
  [{:keys [query-id edit queries-state name description]}]
  (log/info "Editing SQL query" {:query-id query-id :edit-type (:type edit)})

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

      ;; Apply the edit
      (let [new-sql (apply-sql-edit current-sql edit)
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
