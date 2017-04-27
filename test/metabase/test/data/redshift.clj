(ns metabase.test.data.redshift
  (:require [clojure.string :as s]
            [environ.core :refer [env]]
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

(defn- get-db-env-var
  "Look up the relevant env var for AWS connection details or throw an exception if it's not set.

     (get-db-env-var :user) ; Look up `MB_REDSHIFT_USER`"
  [env-var & [default]]
  (or (env (keyword (format "mb-redshift-%s" (name env-var))))
      default
      (throw (Exception. (format "In order to test Redshift, you must specify the env var MB_REDSHIFT_%s."
                                 (s/upper-case (name env-var)))))))

(def ^:private db-connection-details
  (delay {:host     (get-db-env-var :host)
          :port     (Integer/parseInt (get-db-env-var :port "5439"))
          :db       (get-db-env-var :db)
          :user     (get-db-env-var :user)
          :password (get-db-env-var :password)}))


;; Redshift is tested remotely, which means we need to support multiple tests happening against the same remote host at the same time.
;; Since Redshift doesn't let us create and destroy databases (we must re-use the same database throughout the tests) we'll just fake it
;; by creating a new schema when tests start running and re-use the same schema for each test
(defonce ^:const session-schema-number
  (rand-int 240)) ; there's a maximum of 256 schemas per DB so make sure we don't go over that limit

(defonce ^:const session-schema-name
  (str "schema_" session-schema-number))


(u/strict-extend RedshiftDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:create-db-sql             (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :drop-table-if-exists-sql  generic/drop-table-if-exists-cascade-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :pk-sql-type               (constantly "INTEGER IDENTITY(1,1)")
          :qualified-name-components (partial i/single-db-qualified-name-components session-schema-name)})

  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details (fn [& _]
                                          @db-connection-details)
          :default-schema               (constantly session-schema-name)
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
