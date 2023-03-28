(ns metabase.test.data.redshift
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmethod tx/supports-time-type? :redshift [_driver] false)

;; we don't need to add test extensions here because redshift derives from Postgres and thus already has test
;; extensions

;; Time, UUID types aren't supported by redshift
(doseq [[base-type database-type] {:type/BigInteger "BIGINT"
                                   :type/Boolean    "BOOL"
                                   :type/Date       "DATE"
                                   :type/DateTime   "TIMESTAMP"
                                   :type/Decimal    "DECIMAL"
                                   :type/Float      "FLOAT8"
                                   :type/Integer    "INTEGER"
                                   ;; Use VARCHAR because TEXT in Redshift is VARCHAR(256)
                                   ;; https://docs.aws.amazon.com/redshift/latest/dg/r_Character_types.html#r_Character_types-varchar-or-character-varying
                                   ;; But don't use VARCHAR(MAX) either because of performance impact
                                   ;; https://docs.aws.amazon.com/redshift/latest/dg/c_best-practices-smallest-column-size.html
                                   :type/Text       "VARCHAR(1024)"}]
  (defmethod sql.tx/field-base-type->sql-type [:redshift base-type] [_ _] database-type))

;; If someone tries to run Time column tests with Redshift give them a heads up that Redshift does not support it
(defmethod sql.tx/field-base-type->sql-type [:redshift :type/Time]
  [_ _]
  (throw (UnsupportedOperationException. "Redshift does not have a TIME data type.")))

(def db-connection-details
  (delay {:host     (tx/db-test-env-var-or-throw :redshift :host)
          :port     (Integer/parseInt (tx/db-test-env-var-or-throw :redshift :port "5439"))
          :db       (tx/db-test-env-var-or-throw :redshift :db)
          :user     (tx/db-test-env-var-or-throw :redshift :user)
          :password (tx/db-test-env-var-or-throw :redshift :password)}))

(defmethod tx/dbdef->connection-details :redshift
  [& _]
  @db-connection-details)

(defn unique-session-schema []
  (str (sql.tu.unique-prefix/unique-prefix) "schema"))

(defmethod sql.tx/create-db-sql         :redshift [& _] nil)
(defmethod sql.tx/drop-db-if-exists-sql :redshift [& _] nil)

(defmethod sql.tx/pk-sql-type :redshift [_] "INTEGER IDENTITY(1,1)")

(defmethod sql.tx/qualified-name-components :redshift [& args]
  (apply tx/single-db-qualified-name-components (unique-session-schema) args))

;; don't use the Postgres implementation of `drop-db-ddl-statements` because it adds an extra statment to kill all
;; open connections to that DB, which doesn't work with Redshift
(defmethod ddl/drop-db-ddl-statements :redshift
  [& args]
  (apply (get-method ddl/drop-db-ddl-statements :sql-jdbc/test-extensions) args))

(defmethod sql.tx/drop-table-if-exists-sql :redshift
  [& args]
  (apply sql.tx/drop-table-if-exists-cascade-sql args))

;;; Create + destroy the schema used for this test session

(defn- delete-old-schemas! [^java.sql.Connection conn]
  (with-open [rset (.. conn getMetaData getSchemas)
              stmt (.createStatement conn)]
    (while (.next rset)
      (let [schema (.getString rset "TABLE_SCHEM")
            sql    (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" schema)]
        (when (sql.tu.unique-prefix/old-dataset-name? schema)
          (log/info (u/format-color 'blue "[redshift] %s" sql))
          (.execute stmt sql))))))

(defn- create-session-schema! [^java.sql.Connection conn]
  (with-open [stmt (.createStatement conn)]
    (doseq [^String sql [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" (unique-session-schema))
                         (format "CREATE SCHEMA \"%s\";"  (unique-session-schema))]]
      (log/info (u/format-color 'blue "[redshift] %s" sql))
      (.execute stmt sql))))

(defmethod tx/before-run :redshift
  [_driver]
  (with-open [conn (jdbc/get-connection
                    (sql-jdbc.conn/connection-details->spec :redshift @db-connection-details))]
    (delete-old-schemas! conn)
    (create-session-schema! conn)))

(defonce ^:private ^{:arglists '([driver connection metadata _ _])}
  original-filtered-syncable-schemas
  (get-method sql-jdbc.sync/filtered-syncable-schemas :redshift))

(def ^:dynamic *use-original-filtered-syncable-schemas-impl?*
  "Whether to use the actual prod impl for `filtered-syncable-schemas` rather than the special test one that only syncs
  the test schema."
  false)

;; replace the impl the `metabase.driver.redshift`. Only sync the current test schema and the external "spectrum"
;; schema used for a specific test.
(defmethod sql-jdbc.sync/filtered-syncable-schemas :redshift
  [driver conn metadata schema-inclusion-filters schema-exclusion-filters]
  (if *use-original-filtered-syncable-schemas-impl?*
    (original-filtered-syncable-schemas driver conn metadata schema-inclusion-filters schema-exclusion-filters)
    #{(unique-session-schema) "spectrum"}))
