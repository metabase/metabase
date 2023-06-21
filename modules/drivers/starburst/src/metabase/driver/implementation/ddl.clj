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

(defn- get-catalog
  "Get catalog value from database object"
  [database]
  (get-in database [:details :catalog]))

(defn- assoc-catalog
  "Return a new database object set with given catalog"
  [database catalog]
  (assoc-in database [:details :catalog] catalog))


(defn- table-qname
  [catalog schema table]
  (format "%s.%s.%s"
          (quote-fn :table catalog)
          (quote-fn :table schema)
          (quote-fn :table table)))

(defn- get-used-catalogs
  "Get used catalogs"
  [database]
  (let [catalog (get-in database [:details :catalog])
        secondary-catalog (get-in database [:details :secondary-catalog])]
    (if (some? secondary-catalog) [catalog secondary-catalog] [catalog])))

(defn execute!
  "Executes sql and params with a standard remark prepended to the statement."
  [conn [sql & params]]
  (jdbc/execute! conn (into [(add-remark sql)] params) {:transaction? false}))

(defn- create-table-as-sql
  "Formats a create table as statement"
  [table query]
    (format "create table %s as %s" table query))

(defn- create-table-like-sql
  "Formats a create table like existing table statement"
  [table existing-table]
  (format "create table %s (like %s)" table existing-table))

(defn- insert-into-from-sql
  "Formats a insert into table from another table statement"
  [target source]
  (format "insert into %s select * from %s" target source))

(defn create-schema-sql
  "Formats a create schema statement"
  ([database]
   (format "create schema if not exists %s.%s"
           (quote-fn :table (get-catalog database))
           (quote-fn :table (ddl.i/schema-name database (public-settings/site-uuid))))))

(defn drop-table-sql
  "Formats a drop table statement"
  [qname]
    (format "drop table if exists %s" qname))

(defn- create-kv-table-honey-sql-form
  "The honeysql form that creates the persisted schema `cache_info` table."
  [schema-name]
  {:create-table [(keyword schema-name "cache_info") :if-not-exists]
   :with-columns [[:key :varchar] [:value :varchar]]})


(defmethod ddl.i/refresh! :starburst [_driver database definition dataset-query]
  (let [{:keys [query params]} (qp/compile dataset-query)]
    (jdbc/with-db-connection [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
      (let [table-name (:table-name definition)
            schema-name (ddl.i/schema-name database (public-settings/site-uuid))
            main-catalog (get-catalog database)
            secondary-catalog (get-in database [:details :secondary-catalog])]

        (if (some? secondary-catalog)
          (let [target-table (table-qname main-catalog schema-name table-name)
                source-table (table-qname secondary-catalog schema-name table-name)]
            (execute! conn (into [(create-table-as-sql source-table query)] params))
            (try
              (execute! conn [(drop-table-sql target-table)])
              (execute! conn [(create-table-like-sql target-table source-table)])
              (execute! conn [(insert-into-from-sql target-table source-table)])
              (catch Exception e
                (log/warn e)
                (throw e))
              (finally
                (execute! conn [(drop-table-sql source-table)]))))
          (let [target-table (table-qname main-catalog schema-name table-name)
                source-table (table-qname main-catalog schema-name (str table-name "_tmp"))]
            (execute! conn (into [(create-table-as-sql source-table query)] params))
            (try
              (execute! conn [(drop-table-sql target-table)])
              (execute! conn [(create-table-as-sql target-table (format "select * from %s" source-table))])
              (catch Exception e
                (log/warn e)
                (throw e))
              (finally
                (execute! conn [(drop-table-sql source-table)]))))))
      {:state :success})))


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
        catalogs    (get-used-catalogs database)
        steps       [[:persist.check/create-schema
                      (fn check-schema [conn]
                        (doseq [catalog catalogs]
                          (execute! conn [(create-schema-sql (assoc-catalog database catalog))])))]
                     [:persist.check/create-table
                      (fn create-table [conn]
                        (doseq [catalog catalogs]
                          (execute! conn [(create-table-as-sql
                                           (table-qname catalog schema-name table-name)
                                           "select 1 tmp")])))]
                     [:persist.check/read-table
                      (fn read-table [conn]
                        (doseq [catalog catalogs]
                          (sql.ddl/jdbc-query conn [(format "select * from %s"
                                                            (table-qname catalog schema-name table-name))])))]
                     [:persist.check/delete-table
                      (fn delete-table [conn]
                        (doseq [catalog catalogs]
                          (execute! conn [(drop-table-sql
                                           (table-qname catalog schema-name table-name))])))]
                     [:persist.check/create-kv-table
                      (fn create-kv-table [conn]
                        (execute! conn [(format "drop table if exists %s.cache_info"
                                                schema-name)])
                        (execute! conn (sql/format
                                        (create-kv-table-honey-sql-form schema-name)
                                        {:dialect :ansi})))]
                     [:persist.check/populate-kv-table
                      (fn populate-kv-table [conn]
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
