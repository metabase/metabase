(ns metabase.driver.ddl.postgres
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.ddl.sql :as ddl.sql]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.util.i18n :refer [trs]]))

(defn- set-statement-timeout!
  "Must be called within a transaction.
   Sets the current transaction `statement_timeout` to the minimum
   of the current (non-zero) value and ten minutes.

   This helps to address unexpectedly large/long running queries."
  [tx]
  (let [existing-timeout (->> (hsql/format {:select [:setting]
                                            :from [:pg_settings]
                                            :where [:= :name "statement_timeout"]})
                              (ddl.sql/jdbc-query tx)
                              first
                              :setting
                              parse-long)
        ten-minutes (.toMillis (t/minutes 10))
        new-timeout (if (zero? existing-timeout)
                      ten-minutes
                      (min ten-minutes existing-timeout))]
    ;; Can't use a prepared parameter with these statements
    (ddl.sql/execute! tx [(format "SET LOCAL statement_timeout TO '%s'" (str new-timeout))])))

(defmethod ddl.i/refresh! :postgres [_driver database definition dataset-query]
  (let [{:keys [query params]} (qp/compile dataset-query)]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (jdbc/with-db-transaction [tx conn]
        (set-statement-timeout! tx)
        (ddl.sql/execute! tx [(ddl.sql/drop-table-sql database (:table-name definition))])
        (ddl.sql/execute! tx (into [(ddl.sql/create-table-sql database definition query)] params)))
      {:state :success})))

(defmethod ddl.i/unpersist! :postgres
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (ddl.sql/execute! conn [(ddl.sql/drop-table-sql database (:table_name persisted-info))])
      (catch Exception e
        (log/warn e)
        (throw e)))))

(defmethod ddl.i/check-can-persist :postgres
  [database]
  (let [schema-name (ddl.i/schema-name database (public-settings/site-uuid))
        table-name  (format "persistence_check_%s" (rand-int 10000))
        steps       [[:persist.check/create-schema
                      (fn check-schema [conn]
                        (let [existing-schemas (->> ["select schema_name from information_schema.schemata"]
                                                    (ddl.sql/jdbc-query conn)
                                                    (map :schema_name)
                                                    (into #{}))]
                          (or (contains? existing-schemas schema-name)
                              (ddl.sql/execute! conn [(ddl.sql/create-schema-sql database)]))))]
                     [:persist.check/create-table
                      (fn create-table [conn]
                        (ddl.sql/execute! conn [(ddl.sql/create-table-sql database
                                                          {:table-name table-name
                                                           :field-definitions [{:field-name "field"
                                                                                :base-type :type/Text}]}
                                                          "values (1)")]))]
                     [:persist.check/read-table
                      (fn read-table [conn]
                        (ddl.sql/jdbc-query conn [(format "select * from %s.%s"
                                             schema-name table-name)]))]
                     [:persist.check/delete-table
                      (fn delete-table [conn]
                        (ddl.sql/execute! conn [(ddl.sql/drop-table-sql database table-name)]))]]]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (jdbc/with-db-transaction
        [tx conn]
        (set-statement-timeout! tx)
        (loop [[[step stepfn] & remaining] steps]
          (let [result (try (stepfn tx)
                            (log/info (trs "Step {0} was successful for db {1}"
                                           step (:name database)))
                            ::valid
                            (catch Exception e
                              (log/warn (trs "Error in `{0}` while checking for model persistence permissions." step))
                              (log/warn e)
                              step))]
            (cond (and (= result ::valid) remaining)
                  (recur remaining)

                  (= result ::valid)
                  [true :persist.check/valid]

                  :else [false step])))))))
