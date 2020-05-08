(ns metabase.test.data.redshift
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util :as u]))

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
                                   :type/Text       "TEXT"}]
  (defmethod sql.tx/field-base-type->sql-type [:redshift base-type] [_ _] database-type))

;; If someone tries to run Time column tests with Redshift give them a heads up that Redshift does not support it
(defmethod sql.tx/field-base-type->sql-type [:redshift :type/Time]
  [_ _]
  (throw (UnsupportedOperationException. "Redshift does not have a TIME data type.")))

(def ^:private db-connection-details
  (delay {:host     (tx/db-test-env-var-or-throw :redshift :host)
          :port     (Integer/parseInt (tx/db-test-env-var-or-throw :redshift :port "5439"))
          :db       (tx/db-test-env-var-or-throw :redshift :db)
          :user     (tx/db-test-env-var-or-throw :redshift :user)
          :password (tx/db-test-env-var-or-throw :redshift :password)}))

(defmethod tx/dbdef->connection-details :redshift
  [& _]
  @db-connection-details)

;; Redshift is tested remotely, which means we need to support multiple tests happening against the same remote host
;; at the same time. Since Redshift doesn't let us create and destroy databases (we must re-use the same database
;; throughout the tests) we'll just fake it by creating a new schema when tests start running and re-use the same
;; schema for each test
(defonce ^:private session-schema-number
  (rand-int 240)) ; there's a maximum of 256 schemas per DB so make sure we don't go over that limit

(defonce session-schema-name
  (str "schema_" session-schema-number))

;; When we test against Redshift we use a session-unique schema so we can run simultaneous tests
;; against a single remote host; when running tests tell the sync process to ignore all the other schemas
(def ^:private excluded-schemas
  (memoize
   (fn []
     (set (conj (for [i     (range 240)
                      :when (not= i session-schema-number)]
                  (str "schema_" i))
                "public")))))

(defmethod sql-jdbc.sync/excluded-schemas :redshift [_]
  (excluded-schemas))

(defmethod sql.tx/create-db-sql         :redshift [& _] nil)
(defmethod sql.tx/drop-db-if-exists-sql :redshift [& _] nil)

(defmethod sql.tx/pk-sql-type :redshift [_] "INTEGER IDENTITY(1,1)")

(defmethod sql.tx/qualified-name-components :redshift [& args]
  (apply tx/single-db-qualified-name-components session-schema-name args))

;; don't use the Postgres implementation of `drop-db-ddl-statements` because it adds an extra statment to kill all
;; open connections to that DB, which doesn't work with Redshift
(defmethod ddl/drop-db-ddl-statements :redshift
  [& args]
  (apply (get-method ddl/drop-db-ddl-statements :sql-jdbc/test-extensions) args))

(defmethod sql.tx/drop-table-if-exists-sql :redshift
  [& args]
  (apply sql.tx/drop-table-if-exists-cascade-sql args))

;;; Create + destroy the schema used for this test session

(defn- execute! [format-string & args]
  (let [sql  (apply format format-string args)
        spec (sql-jdbc.conn/connection-details->spec :redshift @db-connection-details)]
    (println (u/format-color 'blue "[redshift] %s" sql))
    (jdbc/execute! spec sql))
  (println (u/format-color 'blue "[ok]")))

(defmethod tx/before-run :redshift
  [_]
  (execute! "DROP SCHEMA IF EXISTS %s CASCADE; CREATE SCHEMA %s;" session-schema-name session-schema-name))
