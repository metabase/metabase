(ns metabase.driver.sql-jdbc.csv
  (:require
   [honey.sql :as sql]
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

(defn create-table-sql
  [table-name schema]
  (first (sql/format {:create-table table-name
                      :with-columns
                      (for [{:keys [database-name database-type]} schema]
                        [database-name database-type])})))

(defn create-table!
  [db-id table-name schema]
  (let [sql (str "DROP TABLE IF EXISTS " (name table-name) "; "
                 (create-table-sql table-name schema))]
    (qp.writeback/execute-write-sql! db-id sql)))

(defn insert-rows-sql
  [table-name rows]
  (sql/format {:insert-into table-name :values rows}))

(defn insert-rows!
  [db-id table-name rows]
  (let [sql+params (insert-rows-sql table-name rows)]
    (qp.writeback/execute-write-sql! db-id sql+params)))
