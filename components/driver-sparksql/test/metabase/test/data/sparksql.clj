(ns metabase.test.data.sparksql
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :sparksql)

(doseq [feature [:test/time-type
                 :test/timestamptz-type]]
  (defmethod driver/database-supports? [:sparksql feature]
    [_driver _feature _database]
    false))

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BOOLEAN"
                                   :type/Date           "DATE"
                                   ;; TODO (Cam 9/25/25) -- in Spark SQL 3.4+ (which we don't test against yet)
                                   ;; there's the new `TIMESTAMP_NTZ` type that stores timestamps as wall-clock time
                                   ;; without timezone adjustment.
                                   :type/DateTime       "TIMESTAMP"
                                   ;; stores timestamps as UTC but displays them in session timezone
                                   :type/DateTimeWithTZ "TIMESTAMP"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "DOUBLE"
                                   :type/Integer        "INTEGER"
                                   :type/Text           "STRING"}]
  (defmethod sql.tx/field-base-type->sql-type [:sparksql base-type] [_ _] database-type))

;; If someone tries to run Time column tests with SparkSQL give them a heads up that SparkSQL does not support it
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Time] [_ _]
  (throw (UnsupportedOperationException. "SparkSQL does not have a TIME data type.")))

(defmethod ddl.i/format-name :sparksql
  [_ s]
  (str/replace s #"-" "_"))

(defmethod sql.tx/qualified-name-components :sparksql
  [driver & args]
  [(ddl.i/format-name driver (u/qualified-name (last args)))])

(defmethod tx/dbdef->connection-details :sparksql
  [driver context {:keys [database-name]}]
  (merge
   {:host     (tx/db-test-env-var-or-throw :sparksql :host "localhost")
    :port     (Integer/parseUnsignedInt (tx/db-test-env-var-or-throw :sparksql :port "10000"))
    :user     (tx/db-test-env-var-or-throw :sparksql :user "admin")
    :password (tx/db-test-env-var-or-throw :sparksql :password "admin")}
   (when (= context :db)
     {:db (ddl.i/format-name driver database-name)})))

(defprotocol ^:private Inline
  (^:private ->inline [this]))

(extend-protocol Inline
  nil
  (->inline [_] nil)

  Object
  (->inline [obj]
    [:raw (sql.qp/inline-value :sparksql obj)]))

(defmethod ddl/insert-rows-honeysql-form :sparksql
  [driver table-identifier row-or-rows]
  (let [rows (u/one-or-many row-or-rows)
        rows (for [row rows]
               (update-vals row
                            (fn [val]
                              (if (and (vector? val)
                                       (= (first val) :metabase.driver.sql.query-processor/compiled))
                                val
                                (->inline val)))))]
    ((get-method ddl/insert-rows-honeysql-form :sql/test-extensions) driver table-identifier rows)))

;;; since we're not parameterizing these statements at all we can load data in bigger chunks than the default 200. For
;;; bigger tables like ORDERS this means loading data takes ~11 seconds instead of ~60
(defmethod load-data/chunk-size :sparksql
  [_driver _dbdef _tabledef]
  1000)

(defmethod load-data/do-insert! :sparksql
  [driver ^java.sql.Connection conn table-identifier rows]
  (let [statements (ddl/insert-rows-dml-statements driver table-identifier rows)]
    (try
      (.setAutoCommit conn true)
      (doseq [sql+args statements]
        (jdbc/execute! {:connection conn} sql+args {:transaction? false}))
      (catch java.sql.SQLException e
        (log/infof "Error inserting data: %s" (u/pprint-to-str 'red statements))
        (jdbc/print-sql-exception-chain e)
        (throw e)))))

(defmethod load-data/row-xform :sparksql
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod sql.tx/create-table-sql :sparksql
  [driver {:keys [database-name]} {:keys [table-name field-definitions]}]
  (let [quote-name #(sql.u/quote-name driver :field (ddl.i/format-name driver %))]
    (format "CREATE TABLE %s (%s)"
            (sql.tx/qualify-and-quote driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quote-name field-name) (if (map? base-type)
                                                                  (:native base-type)
                                                                  (sql.tx/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str)))))

(defmethod sql.tx/drop-table-if-exists-sql :sparksql
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (sql.tx/qualify-and-quote driver database-name table-name)))

(defmethod sql.tx/drop-db-if-exists-sql :sparksql
  [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (sql.tx/qualify-and-quote driver database-name)))

(defmethod sql.tx/add-fk-sql :sparksql [& _] nil)

(defmethod execute/execute-sql! :sparksql [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :sparksql [_] "INT")

(defmethod tx/aggregate-column-info :sparksql
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/BigInteger}))))

;; strip out the default table alias `t1` from the generated native query
(defmethod tx/count-with-field-filter-query :sparksql
  ([driver table field]
   (tx/count-with-field-filter-query driver table field 1))
  ([driver table field sample-value]
   (-> ((get-method tx/count-with-field-filter-query :sql/test-extensions) driver table field sample-value)
       (update :query str/replace #"`t1` " ""))))
