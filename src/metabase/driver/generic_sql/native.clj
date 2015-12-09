(ns metabase.driver.generic-sql.native
  "The `native` query processor."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (korma [core :as korma]
                   db)
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            (metabase.driver [generic-sql :as sql]
                             [util :as driver-util])
            [metabase.models.database :refer [Database]]
            [metabase.util :as u]))

(defn- value->base-type
  "Attempt to match a value we get back from the DB with the corresponding base-type`."
  [v]
  (driver-util/class->base-type (type v)))

(defn process-and-run
  "Process and run a native (raw SQL) QUERY."
  [driver {{sql :query} :native, database-id :database, :as query}]
  (try (let [database (sel :one :fields [Database :engine :details] :id database-id)
             db-conn  (sql/db->jdbc-connection-spec database)]

         (jdbc/with-db-transaction [t-conn db-conn]
           (let [^java.sql.Connection jdbc-connection (:connection t-conn)]
             ;; Disable auto-commit for this transaction, that way shady queries are unable to modify the database
             (.setAutoCommit jdbc-connection false)
             (try
               ;; Set the timezone if applicable
               (when-let [timezone (driver/report-timezone)]
                 (when (and (seq timezone)
                            (contains? (driver/features driver) :set-timezone))
                   (log/debug (u/format-color 'green "%s" (sql/set-timezone-sql driver)))
                   (try (jdbc/db-do-prepared t-conn (sql/set-timezone-sql driver) [timezone])
                        (catch Throwable e
                          (log/error (u/format-color 'red "Failed to set timezone: %s" (.getMessage e)))))))

               ;; Now run the query itself
               (log/debug (u/format-color 'green "%s" sql))
               (let [[columns & [first-row :as rows]] (jdbc/query t-conn sql, :as-arrays? true)]
                 {:rows    rows
                  :columns columns
                  :cols    (for [[column first-value] (partition 2 (interleave columns first-row))]
                             {:name      column
                              :base_type (value->base-type first-value)})})

               ;; Rollback any changes made during this transaction just to be extra-double-sure JDBC doesn't try to commit them automatically for us
               (finally (.rollback jdbc-connection))))))
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e) ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second) ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
