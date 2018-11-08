(ns metabase.test.data.redshift
  (:require [clojure.string :as s]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.redshift.RedshiftDriver))

;; Time, UUID types aren't supported by redshift
(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOL"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT8"
   :type/Integer    "INTEGER"
   :type/Text       "TEXT"})

(def ^:private db-connection-details
  (delay {:host     (i/db-test-env-var-or-throw :redshift :host)
          :port     (Integer/parseInt (i/db-test-env-var-or-throw :redshift :port "5439"))
          :db       (i/db-test-env-var-or-throw :redshift :db)
          :user     (i/db-test-env-var-or-throw :redshift :user)
          :password (i/db-test-env-var-or-throw :redshift :password)}))


;; Redshift is tested remotely, which means we need to support multiple tests happening against the same remote host at the same time.
;; Since Redshift doesn't let us create and destroy databases (we must re-use the same database throughout the tests) we'll just fake it
;; by creating a new schema when tests start running and re-use the same schema for each test
(defonce ^:const session-schema-number
  (rand-int 240)) ; there's a maximum of 256 schemas per DB so make sure we don't go over that limit

(defonce ^:const session-schema-name
  (str "schema_" session-schema-number))


(u/strict-extend RedshiftDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:create-db-sql             (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :drop-table-if-exists-sql  generic/drop-table-if-exists-cascade-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :pk-sql-type               (constantly "INTEGER IDENTITY(1,1)")
          :qualified-name-components (partial i/single-db-qualified-name-components session-schema-name)})

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (fn [& _]
                                          @db-connection-details)
          :engine                       (constantly :redshift)}))


;;; Create + destroy the schema used for this test session

(defn- execute-when-testing-redshift! [format-str & args]
  (generic/execute-when-testing! :redshift
    (fn [] (sql/connection-details->spec (RedshiftDriver.) @db-connection-details))
    (apply format format-str args)))

(defn- create-session-schema!
  {:expectations-options :before-run}
  []
  (execute-when-testing-redshift! "DROP SCHEMA IF EXISTS %s CASCADE; CREATE SCHEMA %s;" session-schema-name session-schema-name))

(defn- destroy-session-schema!
  {:expectations-options :after-run}
  []
  (execute-when-testing-redshift! "DROP SCHEMA IF EXISTS %s CASCADE;" session-schema-name))
