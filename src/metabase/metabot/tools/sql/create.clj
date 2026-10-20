(ns metabase.metabot.tools.sql.create
  "Tool for creating new SQL queries."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable]
   [metabase.metabot.tools.sql.common :as metabot.tools.sql.common]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- create-native-query
  "Create a native (SQL) query structure."
  [database-id sql-content]
  (let [mp (lib-be/application-database-metadata-provider database-id)]
    (-> (lib/native-query mp sql-content)
        ;; Going forward we should ensure consumers are fine processing MBQL 5.
        ^{:clj-kondo/ignore [:discouraged-var]}
        lib/->legacy-MBQL)))

(defn- validate-database-access
  [database-id]
  (when-not (metabot.db/database-exists? database-id)
    (recoverable/unknown-database! {:database-id database-id}))
  (try
    (api/read-check :model/Database database-id)
    (catch clojure.lang.ExceptionInfo e
      (condp = (:status-code (ex-data e))
        403 (tools/unrecoverable! ::database-access-denied
                                  {:user-message (tru "You do not have access to this database.")
                                   :data {:database-id database-id}
                                   :cause e})
        404 (recoverable/unknown-database! {:database-id database-id})
        (throw e))))
  (metabot.tools.sql.common/check-native-query-access! database-id))

(mu/defn create-sql-query :- ::metabot.tools.sql.common/operation-result
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
  [{:keys [database-id sql]} :- [:map {:closed true}
                                 [:database-id :int]
                                 [:sql :string]
                                 [:name {:optional true} [:maybe :string]]]]
  (log/info "Creating SQL query"
            {:database-id database-id
             :sql-length (count sql)})

  ;; Validate access
  (validate-database-access database-id)

  (let [dialect (metabot.tools.sql.validation/database-id->dialect database-id)

        {:keys [valid? transpiled-sql] :as validation-result}
        (metabot.tools.sql.validation/validate-sql dialect sql)]
    (merge {:validation-result validation-result}
           (when valid?
             (let [;; Create the in-memory query structure
                   dataset-query (create-native-query database-id transpiled-sql)
                   query-id (u/generate-nano-id)]
               {:action-result {:query-id      query-id
                                :query-content transpiled-sql
                                :query         dataset-query
                                :database      database-id}})))))
