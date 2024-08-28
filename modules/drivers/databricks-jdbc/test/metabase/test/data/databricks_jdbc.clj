(ns metabase.test.data.databricks-jdbc
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :databricks-jdbc)

(doseq [[base-type database-type] {:type/BigInteger             "BIGINT"
                                   :type/Boolean                "BOOLEAN"
                                   :type/Date                   "DATE"
                                   ;; Even thought Databricks does not support time types, mapping for `:type/Time`
                                   ;; is defined. It makes tests that use dataset with time columns usable with
                                   ;; the driver, assuming those columns are not used. (Eg. `attempted-murders`.)
                                   :type/Time                   "TIMESTAMP_NTZ"
                                   :type/DateTime               "TIMESTAMP_NTZ"
                                   :type/DateTimeWithLocalTZ    "TIMESTAMP"
                                   :type/Decimal                "DECIMAL"
                                   :type/Float                  "DOUBLE"
                                   :type/Integer                "INTEGER"
                                   :type/Text                   "STRING"}]
  (defmethod sql.tx/field-base-type->sql-type [:databricks-jdbc base-type] [_driver _base-type] database-type))

(defmethod driver/database-supports? [:databricks-jdbc :test/time-type]
  [_driver _feature _database]
  false)

(defmethod driver/database-supports? [:databricks-jdbc :test/timestamptz-type]
  [_driver _feature _database]
  false)

(defmethod tx/dbdef->connection-details :databricks-jdbc
  [_driver _connection-type {:keys [database-name] :as _dbdef}]
  (merge
   {:host      (tx/db-test-env-var-or-throw :databricks-jdbc :host)
    :token     (tx/db-test-env-var-or-throw :databricks-jdbc :token)
    :http-path (tx/db-test-env-var-or-throw :databricks-jdbc :http-path)
    :catalog   (tx/db-test-env-var-or-throw :databricks-jdbc :catalog)}
   (when (string? (not-empty database-name))
     {:schema database-name})))

(defn- existing-databases
  "Set of databases that already exist. Used to avoid creating those"
  []
  (sql-jdbc.execute/do-with-connection-with-options
   :databricks-jdbc
   (->> (tx/dbdef->connection-details :databricks-jdbc nil nil)
        (sql-jdbc.conn/connection-details->spec :databricks-jdbc))
   nil
   (fn [^java.sql.Connection conn]
     (into #{} (map :databasename) (jdbc/query {:connection conn} ["SHOW DATABASES;"])))))

(defmethod tx/dataset-already-loaded? :databricks-jdbc
  [_driver dbdef]
  (contains? (existing-databases) (:database-name dbdef)))

;; TODO: Disable when done with development!
(def ^:private ^:dynamic *allow-database-creation*
  "Same approach is used in Databricks driver as in Athena. Dataset creation is disabled by default. Datasets are
  preloaded in Databricks instance that tests run against. If you need to create new database on the instance,
  run your test with this var bound to true."
  true #_false)

(defmethod tx/create-db! :databricks-jdbc
  ;; very probably here database-name should be used as arg is db def!!!
  [driver {:keys [database-name], :as dbdef} & options]
  (let [schema (ddl.i/format-name driver database-name)]
    (cond
      (contains? (existing-databases) schema)
      (log/infof "Databricks database %s already exists, skipping creation" (pr-str schema))

      (not *allow-database-creation*)
      (log/fatalf (str "Databricks database creation is disabled: not creating database %s. Tests will likely fail.\n"
                       "See metabase.test.data.databricks-jdbc/*allow-database-creation* for more info.")
                  (pr-str schema))

      :else
      (do
        (log/infof "Creating Databricks database %s" (pr-str schema))
        (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver dbdef options)))))

;; Differences to the :sql-jdbc/test-extensions original: false transactions, not using `jdbc/execute!` for
;; timezone setting, not overriding database timezone. Fails as expects ResultSet. That's not the case on Databricks.
(mu/defmethod load-data/do-insert! :databricks-jdbc
  [driver                    :- :keyword
   ^java.sql.Connection conn :- (lib.schema.common/instance-of-class java.sql.Connection)
   table-identifier
   rows]
  (let [statements (ddl/insert-rows-dml-statements driver table-identifier rows)]
      ;; `set-parameters` might try to look at DB timezone; we don't want to do that while loading the data because the
      ;; DB hasn't been synced yet
    (when-let [set-timezone-format-string #_{:clj-kondo/ignore [:deprecated-var]} (sql-jdbc.execute/set-timezone-sql driver)]
      (let [set-timezone-sql (format set-timezone-format-string "'UTC'")]
        (log/debugf "Setting timezone to UTC before inserting data with SQL \"%s\"" set-timezone-sql)
        (with-open [stmt (.createStatement conn)]
          (.execute stmt set-timezone-sql))))
    (doseq [sql-args statements
            :let     [sql-args (if (string? sql-args)
                                 [sql-args]
                                 sql-args)]]
      (assert (string? (first sql-args))
              (format "Bad sql-args: %s" (pr-str sql-args)))
      (log/tracef "[insert] %s" (pr-str sql-args))
      (try
            ;; TODO - why don't we use [[execute/execute-sql!]] here like we do below?
            ;; Tech Debt Issue: #39375
        (jdbc/execute! {:connection conn :transaction? false}
                       sql-args
                       {:set-parameters (fn [stmt params]
                                          (sql-jdbc.execute/set-parameters! driver stmt params))})
        (catch Throwable e
          (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                          {:driver   driver
                           :sql-args (into [(str/split-lines (mdb.query/format-sql (first sql-args)))]
                                           (rest sql-args))}
                          e)))))))

(defmethod load-data/row-xform :databricks-jdbc
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod execute/execute-sql! :databricks-jdbc [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :databricks-jdbc [_] "INT")

(defmethod sql.tx/drop-db-if-exists-sql :databricks-jdbc
  [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (sql.tx/qualify-and-quote driver database-name)))
