(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.h2]
   [metabase.driver.sql.util :as sql.u]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]))

(comment metabase.driver.h2/keep-me)

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :h2)

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BOOLEAN"
                                   :type/Date           "DATE"
                                   :type/DateTime       "DATETIME"
                                   :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "FLOAT"
                                   :type/Integer        "INTEGER"
                                   :type/Text           "VARCHAR"
                                   :type/UUID           "UUID"
                                   :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:h2 base-type] [_ _] database-type))

(defmethod tx/dbdef->connection-details :h2
  [_driver _context dbdef]
  {:db (str "mem:" (tx/escaped-database-name dbdef)
            ;; TODO (Ngoc 2025-12-05) -- we want admins user because workspaces tests need to be able to create
            ;; user and grant privileges and stuffs. is it safe???
            #_(when (= context :db)
                ;; Return details with the GUEST user added so SQL queries are
                ;; allowed.
                ";USER=GUEST;PASSWORD=guest"))})

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
  ["SHUTDOWN;"])

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

(defmethod execute/execute-sql! :h2
  [driver ^java.sql.Connection conn sql]
  ;; we always want to use 'server' context when execute-sql! is called (never
  ;; try connect as GUEST, since we're not giving them priviledges to create
  ;; tables / etc)
  ((get-method execute/execute-sql! :sql-jdbc/test-extensions) driver conn sql))

;; Don't use the h2 driver implementation, which makes the connection string read-only & if-exists only
(defmethod spec/dbdef->spec :h2
  [driver context dbdef]
  (mdb/spec :h2 (tx/dbdef->connection-details driver context dbdef)))

(defmethod load-data/chunk-size :h2
  [_driver _dbdef _tabledef]
  ;; load data all at once
  nil)

(defmethod sql.tx/inline-column-comment-sql :h2
  [& args]
  (apply sql.tx/standard-inline-column-comment-sql args))

(defmethod sql.tx/standalone-table-comment-sql :h2
  [& args]
  (apply sql.tx/standard-standalone-table-comment-sql args))

(defmethod sql.tx/session-schema :h2 [_driver] "PUBLIC")

;;; Make sure the misc one-off test drivers based on H2 aren't trying to reload or destroy the actual H2 data. The need
;;; to implement these methods themselves and no-op
(defmethod tx/create-db! :h2
  [driver dbdef & options]
  (when (= (:database-name dbdef) "test-data")
    (assert (= driver :h2)
            (format "Driver %s is attempting to use H2's implementation of %s, this will stomp on the H2 test data!"
                    driver `tx/create-db!)))
  (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver dbdef options))

(defmethod tx/destroy-db! :h2
  [driver dbdef]
  (when (= (:database-name dbdef) "test-data")
    (assert (= driver :h2)
            (format "Driver %s is attempting to use H2's implementation of %s, this will stomp on the H2 test data!"
                    driver `tx/destroy-db!)))
  ((get-method tx/destroy-db! :sql-jdbc/test-extensions) driver dbdef))
