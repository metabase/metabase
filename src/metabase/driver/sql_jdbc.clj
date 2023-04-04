(ns metabase.driver.sql-jdbc
  "Shared code for drivers for SQL databases using their respective JDBC drivers under the hood."
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.util.honeysql-extensions :as hx]))

(comment sql-jdbc.actions/keep-me)

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
   (let [table-identifier (binding [hx/*honey-sql-version* (sql.qp/honey-sql-version driver)]
                            (->> (hx/identifier :table (:schema table) (:name table))
                                 (sql.qp/->honeysql driver)
                                 sql.qp/maybe-wrap-unaliased-expr))]
     (query driver database (merge {:from [table-identifier]}
                                   honeysql-form)))))


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

(defmethod driver/db-default-timezone :sql-jdbc
  [driver database]
  ;; if the driver has a non-default implementation of [[sql-jdbc.sync/db-default-timezone]], use that.
  (when (not= (get-method sql-jdbc.sync/db-default-timezone driver)
              (get-method sql-jdbc.sync/db-default-timezone :sql-jdbc))
    (sql-jdbc.sync/db-default-timezone driver (sql-jdbc.conn/db->pooled-connection-spec database))))

(defmethod driver/execute-reducible-query :sql-jdbc
  [driver query chans respond]
  (sql-jdbc.execute/execute-reducible-query driver query chans respond))

(defmethod driver/notify-database-updated :sql-jdbc
  [_ database]
  (sql-jdbc.conn/notify-database-updated database))

(defmethod driver/dbms-version :sql-jdbc
  [driver database]
  (sql-jdbc.sync/dbms-version driver (sql-jdbc.conn/db->pooled-connection-spec database)))

(defmethod driver/describe-database :sql-jdbc
  [driver database]
  (sql-jdbc.sync/describe-database driver database))

(defmethod driver/describe-table :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table driver database table))

(defmethod driver/describe-table-fks :sql-jdbc
  [driver database table]
  (sql-jdbc.sync/describe-table-fks driver database table))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (hx/->timestamp expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->Date]
  [_driver _semantic_type expr]
  (hx/->date expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/ISO8601->Time]
  [_driver _semantic_type expr]
  (hx/->time expr))

(defmethod sql.qp/cast-temporal-string [:sql-jdbc :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _semantic_type expr]
  (hx/->timestamp expr))

;; TODO: this assumes schema-name is non-nil and the database supports schemas
(defn- create-table-sql
  [schema-name table-name schema]
  (first (sql/format {:create-table (str schema-name "." table-name)
                      :with-columns
                      (map (juxt (comp keyword :database-name)
                                 (comp keyword :database-type)) schema)})))

;; TODO: this assumes schema-name is non-nil and the database supports schemas
(defmethod driver/create-table :sql-jdbc
  [_driver db-id schema-name table-name csv-schema]
  (let [sql (create-table-sql schema-name table-name csv-schema)]
    (qp.writeback/execute-write-sql! db-id sql)))
