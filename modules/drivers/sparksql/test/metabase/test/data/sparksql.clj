(ns metabase.test.data.sparksql
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
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

;; during unit tests don't treat Spark SQL as having FK support
(defmethod driver/database-supports? [:sparksql :foreign-keys] [_driver _feature _db] (not config/is-test?))

(defmethod tx/supports-time-type? :sparksql [_driver] false)
(defmethod tx/supports-timestamptz-type? :sparksql [_driver] false)

(doseq [[base-type database-type] {:type/BigInteger "BIGINT"
                                   :type/Boolean    "BOOLEAN"
                                   :type/Date       "DATE"
                                   :type/DateTime   "TIMESTAMP"
                                   :type/Decimal    "DECIMAL"
                                   :type/Float      "DOUBLE"
                                   :type/Integer    "INTEGER"
                                   :type/Text       "STRING"}]
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
    [:raw (unprepare/unprepare-value :sparksql obj)]))

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

(defmethod load-data/do-insert! :sparksql
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     spec
     {:write? true}
     (fn [^java.sql.Connection conn]
       (try
         (.setAutoCommit conn false)
         (doseq [sql+args statements]
           (jdbc/execute! {:connection conn} sql+args {:transaction? false}))
         (catch java.sql.SQLException e
           (log/infof "Error inserting data: %s" (u/pprint-to-str 'red statements))
           (jdbc/print-sql-exception-chain e)
           (throw e)))))))

(defmethod load-data/load-data! :sparksql [& args]
  (apply load-data/load-data-maybe-add-ids! args))

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
  [driver table field]
  (-> ((get-method tx/count-with-field-filter-query :sql/test-extensions) driver table field)
      (update :query str/replace #"`t1` " "")))
