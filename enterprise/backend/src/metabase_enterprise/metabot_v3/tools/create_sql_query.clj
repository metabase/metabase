(ns metabase-enterprise.metabot-v3.tools.create-sql-query
  "Tool for creating new SQL queries."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- create-native-query
  "Create a native (SQL) query structure."
  [database-id sql-content]
  {:database database-id
   :type     :native
   :native   {:query sql-content}})

(defn- validate-database-access
  "Check if the current user has access to the database."
  [database-id]
  (when-not (t2/exists? :model/Database :id database-id)
    (throw (ex-info (tru "Database {0} not found" database-id)
                    {:agent-error? true
                     :database-id database-id})))
  (api/read-check :model/Database database-id))

(defn create-sql-query
  "Create a new SQL query card.

  Parameters:
  - database-id: ID of the database to query
  - sql: The SQL query string
  - name: Name for the query (optional)
  - description: Description for the query (optional)
  - collection-id: Collection to save the query in (optional, defaults to user's personal collection)

  Returns a map with:
  - :query-id - The ID of the created query
  - :query-content - The SQL content
  - :database - Database ID"
  [{:keys [database-id sql name description collection-id]}]
  (log/info "Creating SQL query"
            {:database-id database-id
             :name name
             :sql-length (count sql)})

  ;; Validate access
  (validate-database-access database-id)

  ;; Create the query structure
  (let [dataset-query (create-native-query database-id sql)
        card-name (or name (str "SQL Query " (random-uuid)))
        card-data (cond-> {:name                   card-name
                           :dataset_query           dataset-query
                           :display                 :table
                           :visualization_settings  {}
                           :creator_id              api/*current-user-id*}
                    description (assoc :description description)
                    collection-id (assoc :collection_id collection-id))
        ;; Insert the card
        new-card (t2/insert-returning-instance! :model/Card card-data)]

    (log/info "Created SQL query card" {:card-id (:id new-card)})

    {:query-id      (:id new-card)
     :query-content sql
     :database      database-id}))

(defn create-sql-query-tool
  "Tool handler for create_sql_query tool.
  Returns structured output with query details."
  [args]
  (try
    (let [result (create-sql-query args)]
      {:structured-output result})
    (catch Exception e
      (log/error e "Error creating SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create SQL query: " (or (ex-message e) "Unknown error"))}))))
