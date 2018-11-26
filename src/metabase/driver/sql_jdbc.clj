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

(defn- qualify+escape ^clojure.lang.Keyword
  ([table]       (hx/qualify-and-escape-dots (:schema table) (:name table)))
  ([table field] (hx/qualify-and-escape-dots (:schema table) (:name table) (:name field))))

;; TODO - Seems like this is only used in a handful of places, consider moving to util namespace
(defn query
  "Execute a `honeysql-form` query against `database`, `driver`, and optionally `table`."
  ([driver database honeysql-form]
   (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
               (sql.qp/honeysql-form->sql+args driver honeysql-form)))
  ([driver database table honeysql-form]
   (query driver database (merge {:from [(qualify+escape table)]}
                                 honeysql-form))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Default SQL JDBC metabase.driver impls                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/can-connect? :sql-jdbc [driver details]
  (sql-jdbc.conn/can-connect? driver details))

(defmethod driver/table-rows-seq :sql-jdbc [driver database table]
  (query driver database table {:select [:*]}))

(defmethod driver/supports? [:sql-jdbc :set-timezone] [driver _]
  (boolean (seq (sql-jdbc.execute/set-timezone-sql driver))))

(defmethod driver/execute-query :sql-jdbc [driver query]
  (sql-jdbc.execute/execute-query driver query))

(defmethod driver/notify-database-updated :sql-jdbc [driver database]
  (sql-jdbc.conn/notify-database-updated driver database))

(defmethod driver/describe-database :sql-jdbc [driver database]
  (sql-jdbc.sync/describe-database driver database))

(defmethod driver/describe-table :sql-jdbc [driver database table]
  (sql-jdbc.sync/describe-table driver database table))

(defmethod driver/describe-table-fks :sql-jdbc [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table))
