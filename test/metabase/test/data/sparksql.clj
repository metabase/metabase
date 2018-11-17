(ns metabase.test.data.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [honeysql
             [core :as hsql]
             [format :as hformat]
             [helpers :as h]]
            [metabase.driver.hive-like :as hive-like]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]
             [spec :as spec]]
            [metabase.util.honeysql-extensions :as hx]))

(sql-jdbc.tx/add-test-extensions! :sparksql)

(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Boolean]    [_ _] "BOOLEAN")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/DateTime]   [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Float]      [_ _] "DOUBLE")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Text]       [_ _] "STRING")

(defmethod tx/format-name :sparksql [_ s]
  (s/replace s #"-" "_"))

(defmethod sql.tx/qualified-name-components :sparksql [driver & args]
  (map (partial tx/format-name driver) args))

(defmethod sql.tx/qualify+quote-name :sparksql
  ([driver db-name]
   (tx/format-name driver db-name))
  ([driver _ table-name]
   (tx/format-name driver table-name))
  ([driver _ _ field-name]
   (tx/format-name driver field-name)))

(defmethod tx/dbdef->connection-details :sparksql [driver context {:keys [database-name]}]
  (merge {:host     "localhost"
          :port     10000
          :user     "admin"
          :password "admin"}
         (when (= context :db)
           {:db (tx/format-name driver database-name)})))

(defmethod load-data/do-insert! :sparksql [driver spec table-name row-or-rows]
  (let [prepare-key (comp keyword (partial sql.tx/prepare-identifier driver) name)
        rows        (if (sequential? row-or-rows)
                      row-or-rows
                      [row-or-rows])
        columns     (keys (first rows))
        values      (for [row rows]
                      (for [value (map row columns)]
                        (sql.qp/->honeysql driver value)))
        hsql-form   (-> (h/insert-into (prepare-key table-name))
                        (h/values values))
        sql+args    (hive-like/unprepare
                     (hx/unescape-dots (binding [hformat/*subquery?* false]
                                         (hsql/format hsql-form
                                                      :quoting             (sql.qp/quote-style driver)
                                                      :allow-dashed-names? false))))]
    (with-open [conn (jdbc/get-connection spec)]
      (try
        (.setAutoCommit conn false)
        (jdbc/execute! {:connection conn} sql+args {:transaction? false})
        (catch java.sql.SQLException e
          (jdbc/print-sql-exception-chain e))))))

(defmethod load-data/load-data! :sparksql [& args]
  (apply load-data/load-data-add-ids! args))

(defmethod sql.tx/create-table-sql :sparksql
  [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quote-name    (partial sql.tx/quote-name driver)
        pk-field-name (quote-name (sql.tx/pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s)"
            (sql.tx/qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quote-name field-name) (if (map? base-type)
                                                                  (:native base-type)
                                                                  (sql.tx/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (sql.tx/pk-sql-type driver)
            pk-field-name)))

(defmethod sql.tx/drop-table-if-exists-sql :sparksql [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (sql.tx/qualify+quote-name driver database-name table-name)))

(defmethod sql.tx/drop-db-if-exists-sql :sparksql [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (sql.tx/qualify+quote-name driver database-name)))

(defmethod sql.tx/add-fk-sql :sparksql [& _] nil)

(defmethod execute/execute-sql! :sparksql [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :sparksql [_] "INT")
