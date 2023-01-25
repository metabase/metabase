(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require
   [metabase.db :as mdb]
   [metabase.models.database :refer [Database]]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [toucan.db :as db]))

(sql-jdbc.tx/add-test-extensions! :h2)

(defonce ^:private h2-test-dbs-created-by-this-instance (atom #{}))

(defn- destroy-test-database-if-created-by-another-instance!
  "For H2, test databases are all in-memory, which don't work if they're saved from a different REPL session or the
  like. So delete any 'stale' in-mem DBs from the application DB when someone calls `get-or-create-database!` as
  needed."
  [database-name]
  (when-not (contains? @h2-test-dbs-created-by-this-instance database-name)
    (locking h2-test-dbs-created-by-this-instance
      (when-not (contains? @h2-test-dbs-created-by-this-instance database-name)
        (mdb/setup-db!)                 ; if not already setup
        (db/delete! Database :engine "h2", :name database-name)
        (swap! h2-test-dbs-created-by-this-instance conj database-name)))))

(defmethod data.impl/get-or-create-database! :h2
  [driver dataset-name]
  (destroy-test-database-if-created-by-another-instance! dataset-name)
  ((get-method data.impl/get-or-create-database! :default) driver dataset-name))

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BOOLEAN"
                                   :type/Date           "DATE"
                                   :type/DateTime       "DATETIME"
                                   :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "FLOAT"
                                   :type/Integer        "INTEGER"
                                   :type/Text           "VARCHAR"
                                   :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:h2 base-type] [_ _] database-type))

(defmethod tx/dbdef->connection-details :h2
  [_driver context dbdef]
  {:db (str "mem:" (tx/escaped-database-name dbdef) (when (= context :db)
                                                      ;; Return details with the GUEST user added so SQL queries are
                                                      ;; allowed.
                                                      ";USER=GUEST;PASSWORD=guest"))})

(defmethod sql.tx/pk-sql-type :h2 [_] "BIGINT AUTO_INCREMENT")

(defmethod sql.tx/pk-field-name :h2 [_] "ID")

(defmethod tx/id-field-type :h2 [_] :type/BigInteger)

(defmethod tx/aggregate-column-info :h2
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/BigInteger}))))

(defmethod execute/execute-sql! :h2
  [driver _context dbdef sql]
  ;; we always want to use 'server' context when execute-sql! is called (never
  ;; try connect as GUEST, since we're not giving them priviledges to create
  ;; tables / etc)
  ((get-method execute/execute-sql! :sql-jdbc/test-extensions) driver :server dbdef sql))
