(ns metabase.driver.postgres.ddl
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [java-time :as t]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.ddl :as sql.ddl]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- set-statement-timeout!
  "Must be called within a transaction.
   Sets the current transaction `statement_timeout` to the minimum
   of the current (non-zero) value and ten minutes.

   This helps to address unexpectedly large/long running queries."
  [tx]
  (let [existing-timeout (->> #_{:clj-kondo/ignore [:discouraged-var]}
                              (sql/format {:select [:setting]
                                           :from   [:pg_settings]
                                           :where  [:= :name "statement_timeout"]}
                                          {:quoted false})
                              (sql.ddl/jdbc-query tx)
                              first
                              :setting
                              parse-long)
        ten-minutes      (.toMillis (t/minutes 10))
        new-timeout      (if (zero? existing-timeout)
                           ten-minutes
                           (min ten-minutes existing-timeout))]
    ;; Can't use a prepared parameter with these statements
    (sql.ddl/execute! tx [(format "SET LOCAL statement_timeout TO '%s'" (str new-timeout))])))

(defmethod ddl.i/refresh! :postgres [_driver database definition dataset-query]
  (let [{:keys [query params]} (qp/compile dataset-query)]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (jdbc/with-db-transaction [tx conn]
        (set-statement-timeout! tx)
        (sql.ddl/execute! tx [(sql.ddl/drop-table-sql database (:table-name definition))])
        (sql.ddl/execute! tx (into [(sql.ddl/create-table-sql database definition query)] params)))
      {:state :success})))

(defmethod ddl.i/unpersist! :postgres
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table_name persisted-info))])
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
                                                    (sql.ddl/jdbc-query conn)
                                                    (map :schema_name)
                                                    (into #{}))]
                          (or (contains? existing-schemas schema-name)
                              (sql.ddl/execute! conn [(sql.ddl/create-schema-sql database)]))))]
                     [:persist.check/create-table
                      (fn create-table [conn]
                        (sql.ddl/execute! conn [(sql.ddl/create-table-sql database
                                                                          {:table-name table-name
                                                                           :field-definitions [{:field-name "field"
                                                                                                :base-type :type/Text}]}
                                                                          "select 1")]))]
                     [:persist.check/read-table
                      (fn read-table [conn]
                        (sql.ddl/jdbc-query conn [(format "select * from %s.%s"
                                                          schema-name table-name)]))]
                     [:persist.check/delete-table
                      (fn delete-table [conn]
                        (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database table-name)]))]
                     [:persist.check/create-kv-table
                      (fn create-kv-table [conn]
                        (sql.ddl/execute! conn [(format "drop table if exists %s.cache_info"
                                                        schema-name)])
                        (sql.ddl/execute! conn (sql/format
                                                (ddl.i/create-kv-table-honey-sql-form schema-name)
                                                {:dialect :ansi})))]
                     [:persist.check/populate-kv-table
                      (fn create-kv-table [conn]
                        (sql.ddl/execute! conn (sql/format
                                                (ddl.i/populate-kv-table-honey-sql-form
                                                 schema-name)
                                                {:dialect :ansi})))]]]
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
