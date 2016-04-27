(ns metabase.driver.crate.native
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.models.database :refer [Database]]
            [metabase.db :refer [sel]]
            [metabase.driver.generic-sql :as sql]
            [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.driver.generic-sql.native :as n]))

(defn process-and-run
  "Process and run a native (raw SQL) QUERY."
  [driver {{sql :query} :native, database-id :database, :as query}]
  (try (let [database (sel :one :fields [Database :engine :details] :id database-id)
             db-conn  (sql/db->jdbc-connection-spec database)]
         (jdbc/with-db-connection [t-conn db-conn]
                                  (let [^java.sql.Connection jdbc-connection (:connection t-conn)]
                                    (try
                                      ;; Now run the query itself
                                      (log/debug (u/format-color 'green "%s" sql))
                                      (let [[columns & [first-row :as rows]] (jdbc/query t-conn sql, :as-arrays? true)]
                                        {:rows    rows
                                         :columns columns
                                         :cols    (for [[column first-value] (partition 2 (interleave columns first-row))]
                                                    {:name      column
                                                     :base_type (n/value->base-type first-value)})})))))
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second)             ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
