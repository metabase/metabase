(ns metabase.test.data.sql-jdbc.execute
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [metabase.driver :as driver]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql-jdbc.spec :as spec])
  (:import java.sql.SQLException))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Impl                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- jdbc-execute! [db-spec sql]
  (jdbc/execute! db-spec [sql] {:transaction? false, :multi? true}))

(defn default-execute-sql! [driver context dbdef sql & {:keys [execute!]
                                                        :or   {execute! jdbc-execute!}}]
  (let [sql (some-> sql s/trim)]
    (when (and (seq sql)
               ;; make sure SQL isn't just semicolons
               (not (s/blank? (s/replace sql #";" ""))))
      ;; Remove excess semicolons, otherwise snippy DBs like Oracle will barf
      (let [sql (s/replace sql #";+" ";")]
        (try
          (execute! (spec/dbdef->spec driver context dbdef) sql)
          (catch SQLException e
            (println "Error executing SQL:" sql)
            (printf "Caught SQLException:\n%s\n"
                    (with-out-str (jdbc/print-sql-exception-chain e)))
            (throw e))
          (catch Throwable e
            (println "Error executing SQL:" sql)
            (printf "Caught Exception: %s %s\n%s\n" (class e) (.getMessage e)
                    (with-out-str (.printStackTrace e)))
            (throw e)))))))

(defn sequentially-execute-sql!
  "Alternative implementation of `execute-sql!` that executes statements one at a time for drivers
  that don't support executing multiple statements at once.

  Since there are some cases were you might want to execute compound statements without splitting, an upside-down
  ampersand (`⅋`) is understood as an \"escaped\" semicolon in the resulting SQL statement."
  [driver context dbdef sql  & {:keys [execute!] :or {execute! default-execute-sql!}}]
  (when sql
    (doseq [statement (map s/trim (s/split sql #";+"))]
      (when (seq statement)
        (execute! driver context dbdef (s/replace statement #"⅋" ";"))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Interface                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti execute-sql!
  "Execute a string of raw SQL. `context` is either `:server` or `:db`. `sql` is a SQL string."
  {:arglists '([driver context dbdef sql]), :style/indent 2}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod execute-sql! :sql-jdbc/test-extensions [driver context defdef sql]
  (default-execute-sql! driver context defdef sql))
