(ns metabase.app-db.query-cancelation)

(set! *warn-on-reflection* true)

(defmulti ^:private query-canceled-exception?*
  {:arglists '([db-type ^java.sql.SQLException e])}
  (fn [db-type _e]
    (keyword db-type)))

(defmethod query-canceled-exception?* :h2
  [_db-type ^java.sql.SQLException e]
  (= (.getErrorCode e) org.h2.api.ErrorCode/STATEMENT_WAS_CANCELED))

(defn- sql-state
  [^java.sql.SQLException e]
  (loop [exception e]
    (if-let [sql-state (.getSQLState exception)]
      sql-state
      (when-let [next-ex (.getNextException exception)]
        (recur next-ex)))))

(defmethod query-canceled-exception?* :postgres
  [_db-type e]
  (= (sql-state e)
     (.getState org.postgresql.util.PSQLState/QUERY_CANCELED)))

;;; MariaDB and MySQL report different error codes for the timeout caused by using .setQueryTimeout. This happens
;;; because they use different mechanisms for causing this timeout. MySQL timesout and terminates the connection
;;; externally. MariaDB uses the max_statement_time configuration that can be passed to a SQL statement to set its.
;;;
;;; Docs for MariaDB:
;;; https://mariadb.com/kb/en/e1317/
;;; https://mariadb.com/kb/en/e1969/
;;; https://mariadb.com/kb/en/e3024/
;;;
;;; Docs for MySQL:
;;; https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
;;;
;;; MySQL can return 1317 and 3024, but 1969 is not an error code in the mysql reference. All of these codes make sense
;;; for MariaDB to return. Hibernate expects 3024, but in testing 1969 was observed.
(defmethod query-canceled-exception?* :mysql
  [_db-type ^java.sql.SQLException e]
  ;; apparently there is no enum in the MariaDB JDBC driver for different error codes >:(
  (contains? #{1317 1969 3024} (.getErrorCode e)))

(defn query-canceled-exception?
  "Whether exception `e` represents a query cancelation."
  [db-type ^Throwable e]
  (boolean
   (or (when (instance? java.sql.SQLException e)
         (query-canceled-exception?* db-type e))
       (when-let [cause (ex-cause e)]
         (query-canceled-exception? db-type cause)))))
