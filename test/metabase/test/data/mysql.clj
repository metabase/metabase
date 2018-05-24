(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.generic-sql :as gsql]
            [metabase.driver.mysql :as mysql]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u]))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger     "BIGINT"
   :type/Boolean        "BOOLEAN" ; Synonym of TINYINT(1)
   :type/Date           "DATE"
   :type/DateTime       "TIMESTAMP"
   :type/DateTimeWithTZ "TIMESTAMP"
   :type/Decimal        "DECIMAL"
   :type/Float          "DOUBLE"
   :type/Integer        "INTEGER"
   :type/Text           "TEXT"
   :type/Time           "TIME"})

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:host         (i/db-test-env-var-or-throw :mysql :host "localhost")
          :port         (i/db-test-env-var-or-throw :mysql :port 3306)
          :user         (i/db-test-env-var :mysql :user "root")
          :timezone     :America/Los_Angeles
;;          :serverTimezone "UTC"
          }
         (when-let [password (i/db-test-env-var :mysql :password)]
           {:password password})
         (when (= context :db)
           {:db database-name})))

(defn- add-connection-params [spec]
  ;; allow inserting dates where value is '0000-00-00' -- this is disallowed by default on newer versions of MySQL, but we still want to test that we can handle it correctly for older ones
  (update spec :subname (u/rpartial str "&sessionVariables=sql_mode='ALLOW_INVALID_DATES'")))

(defn- quote-name [nm]
  (str \` nm \`))


(u/strict-extend (class (mysql/->MySQLDriver))
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:database->spec            (comp add-connection-params (:database->spec generic/DefaultsMixin))
          :execute-sql!              generic/sequentially-execute-sql! ; TODO - we might be able to do SQL all at once by setting `allowMultiQueries=true` on the connection string
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                generic/load-data-all-at-once!
          :pk-sql-type               (constantly "INTEGER NOT NULL AUTO_INCREMENT")
          :quote-name                (u/drop-first-arg quote-name)})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :engine                       (constantly :mysql)}))
