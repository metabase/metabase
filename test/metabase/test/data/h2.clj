(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require [clojure.string :as str]
            [metabase.db.spec :as dbspec]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]
             [spec :as spec]]))

(sql-jdbc.tx/add-test-extensions! :h2)

(defmethod sql.tx/field-base-type->sql-type [:h2 :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Boolean]    [_ _] "BOOL")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/DateTime]   [_ _] "DATETIME")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Float]      [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Text]       [_ _] "VARCHAR")
(defmethod sql.tx/field-base-type->sql-type [:h2 :type/Time]       [_ _] "TIME")

(defmethod tx/dbdef->connection-details :h2 [_ context dbdef]
  {:db (str "mem:" (tx/escaped-name dbdef) (when (= context :db)
                                             ;; Return details with the GUEST user added so SQL queries are allowed.
                                             ";USER=GUEST;PASSWORD=guest"))})

(defmethod sql.tx/prepare-identifier :h2 [_ s]
  (str/upper-case s))

(defmethod sql.tx/pk-sql-type :h2 [_] "BIGINT AUTO_INCREMENT")

(defmethod sql.tx/pk-field-name :h2 [_] "ID")

(defmethod sql.tx/drop-db-if-exists-sql :h2 [& _] nil)

(defmethod sql.tx/create-db-sql :h2 [& _]
  (str
   ;; We don't need to actually do anything to create a database here. Just disable the undo
   ;; log (i.e., transactions) for this DB session because the bulk operations to load data don't need to be atomic
   "SET UNDO_LOG = 0;\n"

   ;; Create a non-admin account 'GUEST' which will be used from here on out
   "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';\n"

   ;; Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
   ;; Set it to to -1 (no automatic closing)
   "SET DB_CLOSE_DELAY -1;"))

(defmethod sql.tx/create-table-sql :h2 [driver dbdef {:keys [table-name], :as tabledef}]
  (str
   ((get-method sql.tx/create-table-sql :sql-jdbc/test-extensions) driver dbdef tabledef)
   ";\n"
   ;; Grant the GUEST account r/w permissions for this table
   (format "GRANT ALL ON %s TO GUEST;" (sql.tx/quote-name driver table-name))))

(defmethod tx/has-questionable-timezone-support? :h2 [_] true)

(defmethod tx/format-name :h2 [_ s]
  (str/upper-case s))

(defmethod tx/id-field-type :h2 [_] :type/BigInteger)

(defmethod execute/execute-sql! :h2 [driver _ dbdef sql]
  ;; we always want to use 'server' context when execute-sql! is called (never
  ;; try connect as GUEST, since we're not giving them priviledges to create
  ;; tables / etc)
  ((get-method execute/execute-sql! :sql-jdbc/test-extensions) driver :server dbdef sql))

;; Don't use the h2 driver implementation, which makes the connection string read-only & if-exists only
(defmethod spec/dbdef->spec :h2 [driver context dbdef]
  (dbspec/h2 (tx/dbdef->connection-details driver context dbdef)))

(defmethod load-data/load-data! :h2 [& args]
  (apply load-data/load-data-all-at-once! args))

(defmethod sql.tx/inline-column-comment-sql :h2 [& args]
  (apply sql.tx/standard-inline-column-comment-sql args))

(defmethod sql.tx/standalone-table-comment-sql :h2 [& args]
  (apply sql.tx/standard-standalone-table-comment-sql args))
