(ns metabase.util.jdbc-exceptions
  "Functions for categorizing java.sql.SQLException throwables. Located so it can be used for both drivers and AppDB."
  (:import
   (java.sql SQLException SQLTimeoutException)))

(set! *warn-on-reflection* true)

(defn- get-sql-state
  "Extract the first non-nil SQLState from a chain of sql exceptions. Return nil if SQLState is not set."
  [^SQLException e]
  (loop [exception e]
    (if-let [sql-state (.getSQLState exception)]
      sql-state
      (when-let [next-ex (.getNextException exception)]
        (recur next-ex)))))

(defmulti ^:private impl-query-canceled?
  "implmenting multimethod for is query canceled."
  {:arglists '([driver ^SQLException e])}
  (fn [driver & _] driver))

;; For Dialects that do return a SQLTimeoutException
(defmethod impl-query-canceled? :default [_ e]
  (instance? SQLTimeoutException e))

;; These messages mirror Hibernate's query canceled handling
(defmethod impl-query-canceled? :postgres [_ e]
  (= (get-sql-state e) "57014"))

(defmethod impl-query-canceled? :h2 [_ ^SQLException e]
  (= (.getErrorCode e) 57014))

;; MariaDB jdbc uses its `max_statement_time` mechanism to timeout. It is unclear which of these
;; codes should be returned. Hibernate expects 3024, but in testing 1969 was observed.
;; https://mariadb.com/kb/en/e1969/
;; https://mariadb.com/kb/en/e3024/
(defmethod impl-query-canceled? :mariadb [_ ^SQLException e]
  (contains? #{1969 3024} (.getErrorCode e)))

(defmethod impl-query-canceled? :mysql [_ ^SQLException e]
  (or (= (.getErrorCode e) 1317)
      ;; when we use MariaDB as the app-db the driver type is returned as `:mysql` so we also need
      ;; to check for the different error code MariaDB uses
      (impl-query-canceled? :mariadb e)))

(defmethod impl-query-canceled? :oracle [_ ^SQLException e]
  (= (.getErrorCode e) 1013))

(defmethod impl-query-canceled? :sqlserver [_ e]
  (= (get-sql-state e) "HY008"))

(defmethod impl-query-canceled? :snowflake [_ e]
  (= (get-sql-state e) "57014"))

(defn- extract-sql-exception
  "Examines the chain of exceptions to find the first SQLException error. Returns nil if no SQLException is found"
  ^SQLException [e]
  (loop [exception e]
    (if (instance? SQLException exception)
      exception
      (when-let [cause (ex-cause exception)]
        (recur cause)))))

(defn query-canceled?
  "Test if exception was canceled because it timed out by setting `.setQueryTimeout` on a `PreparedStatement`.
  Handles extracting the underlying SQLError from the throwable."
  [driver e]
  (if-let [sql-exception (extract-sql-exception e)]
    (impl-query-canceled? driver sql-exception)
    false))
