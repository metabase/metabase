(ns metabase.driver.sql-jdbc.csv
  (:require
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.query-processor.writeback :as qp.writeback]))

(defn file-schema
  "Returns a list of data for all the columns."
  [file]
  ;; WIP: dummy data for now
  [{:csv-name      "column_name"
    :database-name :column_name
    :parse         str
    :database-type :varchar}])

(defn parse-rows
  "Returns a list of rows, where each row is a map from the database column name to a value"
  [schema file]
  ;; WIP: dummy data for now
  [{:column_name "value1"}
   {:column_name "value2"}])

(defn execute-write-sql!
  "Execute a write query in SQL against a database given by `db-id`."
  [db-id sql-or-sql+params]
  (if (sequential? sql-or-sql+params)
    (let [[sql & params] sql-or-sql+params]
      (qp.writeback/execute-write-query! {:type     :native
                                          :database db-id
                                          :native   {:query  sql
                                                     :params params}}))
    (qp.writeback/execute-write-query! {:type     :native
                                        :database db-id
                                        :native   {:query sql-or-sql+params}})))

(defn- create-table-sql
  [table-name schema]
  (first (sql/format {:create-table table-name
                      :with-columns
                      (for [{:keys [database-name database-type]} schema]
                        [database-name database-type])})))

(defmethod driver/create-table! :sql-jdbc
  [_driver db-id table-name schema]
  (let [sql (str "DROP TABLE IF EXISTS " (name table-name) "; "
                 (create-table-sql table-name schema))]
    (execute-write-sql! db-id sql)))

(defn- insert-into-sql
  [table-name rows]
  (sql/format {:insert-into table-name :values rows}))

(defmethod driver/insert-into! :sql-jdbc
  [_driver db-id table-name rows]
  (let [sql+params (insert-into-sql table-name rows)]
    (execute-write-sql! db-id sql+params)))
