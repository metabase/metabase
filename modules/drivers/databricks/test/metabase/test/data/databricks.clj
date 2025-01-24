(ns metabase.test.data.databricks
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

(sql-jdbc.tx/add-test-extensions! :databricks)

(doseq [[base-type database-type] {:type/BigInteger             "BIGINT"
                                   :type/Boolean                "BOOLEAN"
                                   :type/Date                   "DATE"
                                   ;; TODO: `:type/DateTime` and `:type/Time` should be mapped to TIMESTAMP_NTZ.
                                   ;;       There is a bug related to syncing columns of that database type tracked
                                   ;;       in https://github.com/metabase/metabase/issues/47359. When that is
                                   ;;       resolved types should be changed here and Databricks removed from
                                   ;;       broken drivers!
                                   ;; Even though Databricks does not support time types, mapping for `:type/Time`
                                   ;; is defined. It makes tests that use dataset with time columns usable with
                                   ;; the driver, assuming those columns are not used. (Eg. `attempted-murders`.)
                                   :type/Time                   "TIMESTAMP" #_"TIMESTAMP_NTZ"
                                   :type/DateTime               "TIMESTAMP"  #_"TIMESTAMP_NTZ"
                                   :type/DateTimeWithLocalTZ    "TIMESTAMP"
                                   :type/DateTimeWithTZ         "TIMESTAMP"
                                   :type/DateTimeWithZoneOffset "TIMESTAMP"
                                   :type/Decimal                "DECIMAL"
                                   :type/Float                  "DOUBLE"
                                   :type/Integer                "INTEGER"
                                   :type/Text                   "STRING"}]
  (defmethod sql.tx/field-base-type->sql-type [:databricks base-type] [_driver _base-type] database-type))

(doseq [feature [:test/time-type
                 :test/timestamptz-type
                 :test/dynamic-dataset-loading]]
  (defmethod driver/database-supports? [:databricks feature]
    [_driver _feature _database]
    false))

(defmethod tx/dbdef->connection-details :databricks
  [_driver _connection-type {:keys [database-name] :as _dbdef}]
  (merge
   {:host      (tx/db-test-env-var-or-throw :databricks :host)
    :token     (tx/db-test-env-var-or-throw :databricks :token)
    :http-path (tx/db-test-env-var-or-throw :databricks :http-path)
    :catalog   (tx/db-test-env-var-or-throw :databricks :catalog)}
   ;; Databricks' namespace model: catalog, schema, table. With current implementation user can add all schemas
   ;; in catalog on one Metabase database connection. Following expression generates schema filters so only one schema
   ;; is treated as a Metabase database, for compatibility with existing tests.
   (when (string? (not-empty database-name))
     {:schema-filters-type "inclusion"
      :schema-filters-patterns database-name})))

(defn- existing-databases
  "Set of databases that already exist. Used to avoid creating those"
  []
  (sql-jdbc.execute/do-with-connection-with-options
   :databricks
   (->> (tx/dbdef->connection-details :databricks nil nil)
        (sql-jdbc.conn/connection-details->spec :databricks))
   nil
   (fn [^java.sql.Connection conn]
     (into #{} (map :databasename) (jdbc/query {:connection conn} ["SHOW DATABASES;"])))))

(defmethod tx/dataset-already-loaded? :databricks
  [_driver dbdef]
  (contains? (existing-databases) (:database-name dbdef)))

;; Shared datasets are used in the CI testing as per discussion on QPD weekly. This makes the testing code simpler,
;; CI job faster and avoids reaching the quotas as it happened with Redshift.
;;
;; If you need to add new dataset, rebind the `*allow-database-creation*` and use standard functions, eg.:
;;
;; (mt/test-driver
;;   :databricks
;;   (mt/dataset <dataset-name>
;;     (mt/db)))
;;
;; Dataset can be destroyed using `tx/destroy-db` to remove the data from Databricks instance.
;; [[*allow-database-deletion*]] must be bound to true. Then `t2/delete!` can be used to remove the reference from
;; application database.
(def ^:dynamic *allow-database-creation*
  "Same approach is used in Databricks driver as in Athena. Dataset creation is disabled by default. Datasets are
  preloaded in Databricks instance that tests run against. If you need to create new database on the instance,
  run your test with this var bound to true."
  false)

(defmethod tx/create-db! :databricks
  [driver {:keys [database-name], :as dbdef} & options]
  (let [schema (ddl.i/format-name driver database-name)]
    (cond
      (contains? (existing-databases) schema)
      (log/infof "Databricks database %s already exists, skipping creation" (pr-str schema))

      (not *allow-database-creation*)
      (log/fatalf (str "Databricks database creation is disabled: not creating database %s. Tests will likely fail.\n"
                       "See metabase.test.data.databricks/*allow-database-creation* for more info.")
                  (pr-str schema))

      :else
      (do
        (log/infof "Creating Databricks database %s" (pr-str schema))
        (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver dbdef options)))))

(def ^:dynamic *allow-database-deletion*
  "This is used to control `tx/destroy-db!`. Disabling database deletion is useful in CI. Specifically, if initial sync
  of some test dataset our test code destroys the database. In Databricks we want to avoid this, because datasets are
  preloaded and failing sync is likely sync problem. If you need to destroy some dataset bind this to true prior
  to calling `tx/destroy-db!`."
  false)

(defmethod tx/destroy-db! :databricks
  [driver dbdef]
  (if *allow-database-deletion*
    ((get-method tx/destroy-db! :sql-jdbc/test-extensions) driver dbdef)
    (log/warn "`*allow-database-deletion*` is `false`. Database removal is suppressed.")))

;; Differences to the :sql-jdbc/test-extensions original: false transactions, not using `jdbc/execute!` for
;; timezone setting, not overriding database timezone.
;;
;; Timezone has to be set using `.execute` because `jdbc/execute` seems to expect returned ResultSet. That's not the
;; case on Databricks.
(mu/defmethod load-data/do-insert! :databricks
  [driver                    :- :keyword
   ^java.sql.Connection conn :- (lib.schema.common/instance-of-class java.sql.Connection)
   table-identifier
   rows]
  (let [statements (ddl/insert-rows-dml-statements driver table-identifier rows)]
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

;; 2.6.40 jdbc driver version statement param limit 256. Following implementation ensures test dataset loading won't
;; exceed that. Orders table takes ~20 minutes to load.
;; Example:
;; orders table has 12 columns in field def, id and a buffer is added
;; 256 / (12 + 2) = 18
;; so we can insert 18 rows at a time while staying under the param limit.
(defmethod load-data/chunk-size :databricks
  [_driver _dbdef tabledef]
  (let [databricks-jdbc-param-limit-per-statement 256
        reserve 2 ; eg. for id and one more col
        col-count (-> tabledef :field-definitions count)]
    (quot databricks-jdbc-param-limit-per-statement
          (+ reserve col-count))))

(defmethod load-data/row-xform :databricks
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod execute/execute-sql! :databricks [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :databricks [_] "INT")

(defmethod sql.tx/drop-db-if-exists-sql :databricks
  [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (sql.tx/qualify-and-quote driver database-name)))

(defmethod sql.tx/qualified-name-components :databricks
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))
