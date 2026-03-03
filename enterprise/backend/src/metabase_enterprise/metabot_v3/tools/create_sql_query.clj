(ns metabase-enterprise.metabot-v3.tools.create-sql-query
  "Tool for creating new SQL queries."
  (:require
   [metabase-enterprise.metabot-v3.tools.sql-validation :as metabot-v3.tools.sql-validation]
   [metabase-enterprise.metabot-v3.tools.sql.common :as metabot-v3.tools.sql.common]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(mu/defn create-sql-query :- ::metabot-v3.tools.sql.common/operation-result
  "Create a new SQL query in memory.

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
  [{:keys [database-id sql name]}]
  (log/info "Creating SQL query"
            {:database-id database-id
             :name name
             :sql-length (count sql)})

  ;; Validate access
  (validate-database-access database-id)

  (let [dialect (metabot-v3.tools.sql-validation/database-id->dialect database-id)

        {:keys [valid? transpiled-sql] :as validation-result}
        (metabot-v3.tools.sql-validation/validate-sql dialect sql)]
    (merge {:validation-result validation-result}
           (when valid?
             (let [;; Create the in-memory query structure
                   dataset-query (create-native-query database-id transpiled-sql)
                   query-id (u/generate-nano-id)]
               {:action-result {:query-id      query-id
                                :query-content transpiled-sql
                                :query         dataset-query
                                :database      database-id}})))))
