(ns metabase.driver.sql-jdbc
  "Shared code for drivers for SQL databases using their respective JDBC drivers under the hood."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx]))

(driver/register! :sql-jdbc, :parent :sql, :abstract? true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Run a Query                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - Seems like this is only used in a handful of places, consider moving to util namespace
(defn query
  "Execute a `honeysql-form` query against `database`, `driver`, and optionally `table`."
  ([driver database honeysql-form]
   (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
               (sql.qp/format-honeysql driver honeysql-form)))

  ([driver database table honeysql-form]
   (query driver database (merge {:from [(sql.qp/->honeysql driver (hx/identifier :table (:schema table) (:name table)))]}
                                 honeysql-form))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Default SQL JDBC metabase.driver impls                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/can-connect? :sql-jdbc
  [driver details]
  (sql-jdbc.conn/can-connect? driver details))

(defmethod driver/table-rows-seq :sql-jdbc
  [driver database table]
  (query driver database table {:select [:*]}))

;; TODO - this implementation should itself be deprecated! And have drivers implement it directly instead.
(defmethod driver/supports? [:sql-jdbc :set-timezone]
  [driver _]
  (boolean (seq (sql-jdbc.execute/set-timezone-sql driver))))

(defmethod driver/execute-reducible-query :sql-jdbc
  [driver query chans respond]
  (sql-jdbc.execute/execute-reducible-query driver query chans respond))

(defmethod driver/notify-database-updated :sql-jdbc
  [_ database]
  (sql-jdbc.conn/notify-database-updated database))

(defmethod driver/describe-database :sql-jdbc
  [driver database]
  (sql-jdbc.sync/describe-database driver database))

(defmethod driver/describe-table :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table driver database table))

(defmethod driver/describe-table-fks :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table))
