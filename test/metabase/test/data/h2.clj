(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.db :as mdb]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.h2]
   [metabase.driver.sql.util :as sql.u]
   [metabase.models.database :refer [Database]]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase.driver.h2/keep-me)

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
        (mdb/setup-db! :create-sample-content? false) ; skip sample content for speedy tests. this doesn't reflect production
        (t2/delete! Database :engine "h2", :name database-name)
        (swap! h2-test-dbs-created-by-this-instance conj database-name)))))

(defmethod data.impl/get-or-create-database! :h2
  [driver dbdef]
  (let [{:keys [database-name], :as dbdef} (tx/get-dataset-definition dbdef)]
    (destroy-test-database-if-created-by-another-instance! database-name)
    ((get-method data.impl/get-or-create-database! :default) driver dbdef)))

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

(defn- already-loaded? [driver dbdef]
  (with-open [^java.sql.Connection conn #_{:clj-kondo/ignore [:discouraged-var]} (jdbc/get-connection (spec/dbdef->spec driver :server dbdef))]
    (let [metadata (.getMetaData conn)]
      (with-open [rset (.getSchemas metadata)]
        (boolean
         (loop []
           (when (.next rset)
             (or (= (.getString rset "table_schem") "__loaded")
                 (recur)))))))))

(defmethod tx/create-db! :h2
  [driver dbdef & options]
  (when-not (already-loaded? driver dbdef)
    (u/prog1 (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver dbdef options)
      (with-open [^java.sql.Connection conn #_{:clj-kondo/ignore [:discouraged-var]} (jdbc/get-connection (spec/dbdef->spec driver :server dbdef))
                  stmt (.createStatement conn)]
        (.execute stmt "CREATE SCHEMA \"__loaded\";")
        (assert (already-loaded? driver dbdef))))))

(defmethod tx/destroy-db! :h2
  [driver dbdef]
  (when (= (:database-name dbdef) "test-data")
    (assert (= driver :h2)
            (format "non-H2 driver %s attempting to stomp on H2 test data!" driver)))
  ((get-method tx/destroy-db! :sql-jdbc/test-extensions) driver dbdef))

(defmethod sql.tx/pk-sql-type :h2 [_] "BIGINT AUTO_INCREMENT")

(defmethod sql.tx/pk-field-name :h2 [_] "ID")

(defmethod sql.tx/drop-db-if-exists-sql :h2 [& _] nil)

(defmethod sql.tx/create-db-sql :h2
  [& _]
  (str
   ;; Create a non-admin account 'GUEST' which will be used from here on out
   "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';\n"
   ;; Grant permissions for DDL statements
   "GRANT ALTER ANY SCHEMA TO GUEST;"
   ;; Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
   ;; Set it to to -1 (no automatic closing)
   "SET DB_CLOSE_DELAY -1;"))

(defmethod sql.tx/create-table-sql :h2
  [driver dbdef {:keys [table-name], :as tabledef}]
  (str
   ((get-method sql.tx/create-table-sql :sql-jdbc/test-extensions) driver dbdef tabledef)
   ";\n"
   ;; Grant the GUEST account r/w permissions for this table
   (format "GRANT ALL ON %s TO GUEST;" (sql.u/quote-name driver :table (ddl.i/format-name driver table-name)))))

(defmethod ddl.i/format-name :h2
  [_ s]
  (u/upper-case-en s))

(defmethod ddl/drop-db-ddl-statements :h2
  [_driver _dbdef & _options]
  ;; set the DB close delay to 0 which means it can get closed out and purged from memory when the last open connection
  ;; is closed.
  ["SET DB_CLOSE_DELAY 0;"])

(defmethod tx/id-field-type :h2 [_] :type/BigInteger)

(defmethod tx/aggregate-column-info :h2
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (= ag-type :count)
      {:base_type :type/BigInteger})
    (when (= ag-type :cum-count)
      {:base_type :type/Decimal})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/BigInteger})
    ;; because it's implemented as sum(count(field)) OVER (...). But shouldn't a sum of integers be an
    ;; integer? :thinking_face:
    (when (= ag-type :cum-count)
      {:base_type :type/Decimal}))))

(defmethod spec/dbdef->spec :h2
  [driver _context dbdef]
  ;; we always want to use 'server' context to get a connection spec for executing SQL is called (never try connect as
  ;; GUEST, since we're not giving them priviledges to create tables / etc)
  ((get-method spec/dbdef->spec :sql-jdbc/test-extensions) driver :server dbdef))

;; Don't use the h2 driver implementation, which makes the connection string read-only & if-exists only
(defmethod spec/dbdef->spec :h2
  [driver context dbdef]
  (mdb/spec :h2 (tx/dbdef->connection-details driver context dbdef)))

(defmethod load-data/load-data! :h2
  [& args]
  (apply load-data/load-data-all-at-once! args))

(defmethod sql.tx/inline-column-comment-sql :h2
  [& args]
  (apply sql.tx/standard-inline-column-comment-sql args))

(defmethod sql.tx/standalone-table-comment-sql :h2
  [& args]
  (apply sql.tx/standard-standalone-table-comment-sql args))

(defmethod sql.tx/session-schema :h2 [_driver] "PUBLIC")
