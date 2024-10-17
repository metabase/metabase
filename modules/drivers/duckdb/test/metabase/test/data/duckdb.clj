(ns metabase.test.data.duckdb
  (:require [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.driver :as driver]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.test.data.sql-jdbc.load-data :as load-data]))

(sql-jdbc.tx/add-test-extensions! :duckdb)

;(defmethod tx/supports-time-type? :duckb [_driver] false)
;(defmethod tx/sorts-nil-first? :duckdb [_ _] true)

(defmethod tx/dbdef->connection-details :duckdb
  [_driver _context dbdef]
  {:database_file (str (tx/escaped-database-name dbdef) ".duckdb")})

(doseq [[base-type sql-type] {:type/BigInteger             "BIGINT"
                              :type/Boolean                "BOOLEAN"
                              :type/Date                   "DATE"
                              :type/DateTime               "TIMESTAMP"
                              :type/DateTimeWithZoneOffset "TIMESTAMPTZ"
                              :type/Decimal                "DECIMAL"
                              :type/Float                  "DOUBLE"
                              :type/Integer                "INTEGER"
                              :type/Text                   "TEXT"
                              :type/Time                   "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:duckdb base-type] [_ _] sql-type))

(defmethod sql.tx/pk-sql-type :duckdb [_] "INTEGER")

(defmethod tx/aggregate-column-info :duckdb
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer}))))

(defmethod execute/execute-sql! :duckdb [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/load-data! :duckdb [& args]
  (apply load-data/load-data-add-ids-chunked! args))

(defmethod sql.tx/drop-db-if-exists-sql :duckdb [& _] nil)
(defmethod sql.tx/create-db-sql         :duckdb [& _] nil)
(defmethod sql.tx/add-fk-sql            :duckdb [& _] nil) ; TODO - fix me

;; TODO: remove?
(defmethod ddl/insert-rows-ddl-statements :duckdb
  [driver table-identifier row-or-rows]
  (for [sql+args ((get-method ddl/insert-rows-ddl-statements :sql-jdbc/test-extensions) driver table-identifier row-or-rows)]
    (unprepare/unprepare driver sql+args)))
