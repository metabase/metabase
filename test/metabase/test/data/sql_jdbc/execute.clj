(ns metabase.test.data.sql-jdbc.execute
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Impl                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- jdbc-execute! [^java.sql.Connection conn sql]
  (log/tracef "[execute %s] %s" driver/*driver* (pr-str sql))
  (jdbc/execute! {:connection conn} [sql] {:transaction? false, :multi? true}))

(defn default-execute-sql!
  [_driver ^java.sql.Connection conn sql & {:keys [execute!]
                                            :or   {execute! jdbc-execute!}}]
  (let [sql (some-> sql str/trim)]
    (when (and (seq sql)
               ;; make sure SQL isn't just semicolons
               (not (str/blank? (str/replace sql #";" ""))))
      ;; Remove excess semicolons, otherwise snippy DBs like Oracle will barf
      (let [sql (str/replace sql #";+" ";")]
        (try
          (execute! conn sql)
          (catch SQLException e
            (log/errorf "Error executing SQL: %s" sql)
            (log/errorf "Caught SQLException:\n%s\n"
                        (with-out-str (jdbc/print-sql-exception-chain e)))
            (throw e))
          (catch Throwable e
            (log/errorf "Error executing SQL: %s" sql)
            (log/errorf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                        (with-out-str (.printStackTrace e)))
            (throw e)))))))

(defn sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
  that don't support executing multiple statements at once.

  Since there are some cases were you might want to execute compound statements without splitting, an upside-down
  ampersand (`⅋`) is understood as an \"escaped\" semicolon in the resulting SQL statement."
  [driver ^java.sql.Connection conn sql & {:keys [execute!] :or {execute! default-execute-sql!}}]
  (when sql
    (doseq [statement (map str/trim (str/split sql #";+"))]
      (when (seq statement)
        (execute! driver conn (str/replace statement #"⅋" ";"))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Interface                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti execute-sql!
  "Execute a string of raw SQL."
  {:arglists '([driver ^java.sql.Connection conn sql])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod execute-sql! :sql-jdbc/test-extensions
  [driver ^java.sql.Connection conn sql]
  (default-execute-sql! driver conn sql))
