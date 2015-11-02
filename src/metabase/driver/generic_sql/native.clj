(ns metabase.driver.generic-sql.native
  "The `native` query processor."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (korma [core :as korma]
                   db)
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql.util :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.util :as u]))

(defn- value->base-type
  "Attempt to match a value we get back from the DB with the corresponding base-type`."
  [v]
  (driver/class->base-type (type v)))

(defn process-and-run
  "Process and run a native (raw SQL) QUERY."
  [{{sql :query} :native, database-id :database, :as query}]
  (try (let [database                            (sel :one :fields [Database :engine :details] :id database-id)
             db-conn                             (-> database
                                                     db->korma-db
                                                     korma.db/get-connection)
             {:keys [features set-timezone-sql]} (driver/engine->driver (:engine database))]

         (jdbc/with-db-transaction [t-conn db-conn]

           ;; Set the timezone if applicable. We do this *before* making the transaction read-only because some DBs
           ;; won't let you set the timezone on a read-only connection
           (when-let [timezone (driver/report-timezone)]
             (when (and (seq timezone)
                        (contains? features :set-timezone))
               (log/debug (u/format-color 'green "%s" set-timezone-sql))
               (try (jdbc/db-do-prepared t-conn set-timezone-sql [timezone])
                    (catch Throwable e
                      (log/error (u/format-color 'red "Failed to set timezone: %s" (.getMessage e)))))))

           ;; Now make the transaction read-only and run the query itself
           (.setReadOnly ^com.mchange.v2.c3p0.impl.NewProxyConnection (:connection t-conn) true)
           (log/debug (u/format-color 'green "%s" sql))
           (let [[columns & [first-row :as rows]] (jdbc/query t-conn sql, :as-arrays? true)]
             {:rows    rows
              :columns columns
              :cols    (for [[column first-value] (zipmap columns first-row)]
                         {:name      column
                          :base_type (value->base-type first-value)})})))
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e) ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second) ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
