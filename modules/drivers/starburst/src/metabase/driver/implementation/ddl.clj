(ns metabase.driver.implementation.ddl
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.ddl :as sql.ddl]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.log :as log]))



(defmethod ddl.i/refresh! :starburst [_driver database definition dataset-query]
  (let [{:keys [query params]} (qp/compile dataset-query)]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table-name definition))])
      (sql.ddl/execute! conn (into [(sql.ddl/create-table-sql database definition query)] params)))
    {:state :success}))

(defmethod ddl.i/unpersist! :starburst
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database (:table_name persisted-info))])
      (catch Exception e
        (log/warn e)
        (throw e)))))

(defmethod ddl.i/check-can-persist :starburst
  [database]
  (let [schema-name (ddl.i/schema-name database (public-settings/site-uuid))
        table-name  (format "persistence_check_%s" (rand-int 10000))
        steps       [[:persist.check/create-schema
                      (fn check-schema [conn]
                        (let [existing-schemas (->> ["SHOW SCHEMAS"]
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
                                                                          "SELECT 1 tmp")]))]
                     [:persist.check/read-table
                      (fn read-table [conn]
                        (sql.ddl/jdbc-query conn [(format "SELECT * FROM %s.%s"
                                                          schema-name table-name)]))]
                     [:persist.check/delete-table
                      (fn delete-table [conn]
                        (sql.ddl/execute! conn [(sql.ddl/drop-table-sql database table-name)]))]]]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (loop [[[step stepfn] & remaining] steps]
        (let [result (try (stepfn conn)
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

                :else [false step]))))))
