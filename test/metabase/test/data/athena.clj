(ns metabase.test.data.athena
  (:require [clojure.string :as s]
            [environ.core :refer [env]]
            [metabase.db.spec :as dbspec]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.athena.AthenaDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "bigint"
   :type/Boolean    "boolean"
   :type/Date       "date"
   :type/DateTime   "timestamp"
   :type/Decimal    "decimal"
   :type/Float      "float"
   :type/Integer    "int"
   :type/Text       "string"})

(defn- get-db-env-var
  "Look up the relevant env var for AWS connection details or throw an exception if it's not set.

     (get-db-env-var :user) ; Look up `MB_ATHENA_USER`"
  [env-var & [default]]
  (or (env (keyword (format "mb-athena-%s" (name env-var))))
      default
      (throw (Exception. (format "In order to test Athena, you must specify the env var MB_ATHENA_%s."
                                 (s/upper-case (name env-var)))))))

(def ^:private db-connection-details
  (delay {:log_path         (get-db-env-var :log_path "/tmp/athena.log")
          :s3_staging_dir   (get-db-env-var :s3-staging-dir)
          :url              (get-db-env-var :url "jdbc:awsathena://athena.us-east-1.amazonaws.com:443")
          :user             (get-db-env-var :user)
          :password         (get-db-env-var :password)}))


(u/strict-extend AthenaDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:create-db-sql             (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :drop-table-if-exists-sql  (constantly nil)
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                (constantly nil)
          :pk-sql-type               (constantly nil)
          :qualified-name-components (partial i/single-db-qualified-name-components "sampledb")})

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (fn [& _]
                                          @db-connection-details)
          :default-schema               (constantly "sampledb")
          :engine                       (constantly :athena)}))
