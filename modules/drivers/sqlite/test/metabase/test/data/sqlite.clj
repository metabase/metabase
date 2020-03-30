(ns metabase.test.data.sqlite
  (:require [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc.execute :as execute]))

(sql-jdbc.tx/add-test-extensions! :sqlite)

(defmethod tx/dbdef->connection-details :sqlite [_ context dbdef]
  {:db (str (tx/escaped-name dbdef) ".sqlite")})

(doseq [[base-type sql-type] {:type/BigInteger "BIGINT"
                              :type/Boolean    "BOOLEAN"
                              :type/Date       "DATE"
                              :type/DateTime   "DATETIME"
                              :type/Decimal    "DECIMAL"
                              :type/Float      "DOUBLE"
                              :type/Integer    "INTEGER"
                              :type/Text       "TEXT"
                              :type/Time       "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:sqlite base-type] [_ _] sql-type))

(defmethod sql.tx/pk-sql-type :sqlite [_] "INTEGER")

(defmethod tx/aggregate-column-info :sqlite
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

(defmethod execute/execute-sql! :sqlite [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/drop-db-if-exists-sql :sqlite [& _] nil)
(defmethod sql.tx/create-db-sql         :sqlite [& _] nil)
(defmethod sql.tx/add-fk-sql            :sqlite [& _] nil) ; TODO - fix me
