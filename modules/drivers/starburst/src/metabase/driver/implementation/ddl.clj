(ns metabase.driver.implementation.ddl
  (:require [clojure.java.jdbc :as jdbc]
            [honey.sql :as sql]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.ddl :as sql.ddl]
            [metabase.driver.sql.util :as sql.u]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.log :as log]))


(defn- quote-fn [ident entity]
  (sql.u/quote-name :starburst ident (ddl.i/format-name :starburst entity)))

(defn- add-remark [sql-str]
  (str "-- Metabase\n"
       sql-str))

(defn- create-kv-table-honey-sql-form
  "The honeysql form that creates the persisted schema `cache_info` table."
  [schema-name]
  {:create-table [(keyword schema-name "cache_info") :if-not-exists]
   :with-columns [[:key :varchar] [:value :varchar]]})


(defn execute!
  "Executes sql and params with a standard remark prepended to the statement."
  [conn [sql & params]]
  (jdbc/execute! conn (into [(add-remark sql)] params) {:transaction? false}))


(defmethod ddl.i/refresh! :starburst [_driver database definition dataset-query]
  (let [{:keys [query params]} (qp/compile dataset-query)]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (let [schema-name (quote-fn :table (ddl.i/schema-name database (public-settings/site-uuid)))
            temporary-table (assoc definition :table-name (format "%s_tmp" (:table-name definition)))]

          (execute! conn (into [(sql.ddl/create-table-sql database temporary-table query)] params))
        (try
          (execute! conn [(sql.ddl/drop-table-sql database (:table-name definition))])
          (execute! conn [(format "create table %s.%s as select * from %s.%s"
                                          schema-name (:table-name definition)
                                          schema-name (:table-name temporary-table))])
          (catch Exception e
            (log/warn e)
            (throw e))
          (finally
            (execute! conn [(sql.ddl/drop-table-sql database (:table-name temporary-table))])))
        )
      )
    {:state :success}))

(defmethod ddl.i/unpersist! :starburst
  [_driver database persisted-info]
  (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (execute! conn [(sql.ddl/drop-table-sql database (:table_name persisted-info))])
      (catch Exception e
        (log/warn e)
        (throw e)))))

(defmethod ddl.i/check-can-persist :starburst
  [database]
  (let [schema-name (ddl.i/schema-name database (public-settings/site-uuid))
        table-name  (format "persistence_check_%s" (rand-int 10000))
        steps       [[:persist.check/create-schema
                      (fn check-schema [conn]
                        (let [existing-schemas (->> ["show schemas"]
                                                    (sql.ddl/jdbc-query conn)
                                                    (map :schema)
                                                    (into #{}))]
                          (or (contains? existing-schemas schema-name)
                              (execute! conn [(sql.ddl/create-schema-sql database)]))))]
                     [:persist.check/create-table
                      (fn create-table [conn]
                        (execute! conn [(sql.ddl/create-table-sql database
                                                                  {:table-name table-name
                                                                   :field-definitions [{:field-name "field"
                                                                                        :base-type :type/Text}]}
                                                                  "select 1 tmp")]))]
                     [:persist.check/read-table
                      (fn read-table [conn]
                        (sql.ddl/jdbc-query conn [(format "select * from %s.%s"
                                                          schema-name table-name)]))]
                     [:persist.check/delete-table
                      (fn delete-table [conn]
                        (execute! conn [(sql.ddl/drop-table-sql database table-name)]))]
                     [:persist.check/create-kv-table
                      (fn create-kv-table [conn]
                        (execute! conn [(format "drop table if exists %s.cache_info"
                                                        schema-name)])
                        (execute! conn (sql/format
                                        (create-kv-table-honey-sql-form schema-name)
                                        {:dialect :ansi})))]
                     [:persist.check/populate-kv-table
                      (fn create-kv-table [conn]
                        (execute! conn (sql/format
                                        (ddl.i/populate-kv-table-honey-sql-form
                                         schema-name)
                                        {:dialect :ansi})))]]]

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
