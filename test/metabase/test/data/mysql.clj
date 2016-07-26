(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require [clojure.string :as s]
            [environ.core :refer [env]]
            metabase.driver.mysql
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u])
  (:import metabase.driver.mysql.MySQLDriver))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "BIGINT"
   :BooleanField    "BOOLEAN" ; Synonym of TINYINT(1)
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "TIMESTAMP"
   :DecimalField    "DECIMAL"
   :FloatField      "DOUBLE"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

(defn- database->connection-details [context {:keys [database-name short-lived?]}]
  (merge {:host         "localhost"
          :port         3306
          :timezone     :America/Los_Angeles
          :short-lived? short-lived?
          :user         (if (env :circleci) "ubuntu"
                            "root")}
         (when (= context :db)
           {:db database-name})))

(defn- add-connection-params [spec]
  ;; allow inserting dates where value is '0000-00-00' -- this is disallowed by default on newer versions of MySQL, but we still want to test that we can handle it correctly for older ones
  (update spec :subname (u/rpartial str "&sessionVariables=sql_mode='ALLOW_INVALID_DATES'")))

(defn- quote-name [nm]
  (str \` nm \`))

(u/strict-extend MySQLDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:database->spec            (comp add-connection-params (:database->spec generic/DefaultsMixin))
          :execute-sql!              generic/sequentially-execute-sql! ; TODO - we might be able to do SQL all at once by setting `allowMultiQueries=true` on the connection string
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                generic/load-data-all-at-once!
          :pk-sql-type               (constantly "INTEGER NOT NULL AUTO_INCREMENT")
          :quote-name                (u/drop-first-arg quote-name)})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :engine                       (constantly :mysql)}))
