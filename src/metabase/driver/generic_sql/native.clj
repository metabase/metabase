(ns metabase.driver.generic-sql.native
  "The `native` query processor."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.db :refer [sel]]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.database :refer [Database]]
            [metabase.util :as u]))

(defn execute-query
  "Process and run a native (raw SQL) QUERY."
  [driver {:keys [database settings], {sql :query, params :params} :native}]
  (try (let [db-conn (sql/db->jdbc-connection-spec database)]
         (jdbc/with-db-transaction [t-conn db-conn]
           (let [^java.sql.Connection jdbc-connection (:connection t-conn)]
             ;; Disable auto-commit for this transaction, that way shady queries are unable to modify the database
             (.setAutoCommit jdbc-connection false)
             (try
               ;; Set the timezone if applicable
               (when-let [timezone (:report-timezone settings)]
                 (log/debug (u/format-color 'green "%s" (sql/set-timezone-sql driver)))
                 (try (jdbc/db-do-prepared t-conn (sql/set-timezone-sql driver) [timezone])
                      (catch Throwable e
                        (log/error (u/format-color 'red "Failed to set timezone: %s" (.getMessage e))))))

               ;; Now run the query itself
               (log/debug (u/format-color 'green "%s" sql))
               (let [statement (if params
                                 (into [sql] params)
                                 sql)]
                 (let [[columns & rows] (jdbc/query t-conn statement, :identifiers identity, :as-arrays? true)]
                   {:rows    rows
                    :columns columns}))

               ;; Rollback any changes made during this transaction just to be extra-double-sure JDBC doesn't try to commit them automatically for us
               (finally (.rollback jdbc-connection))))))
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second)             ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
