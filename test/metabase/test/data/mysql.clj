(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require [clojure.string :as s]
            [environ.core :refer [env]]
            metabase.driver.mysql
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i]))
  (:import metabase.driver.mysql.MySQLDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/boolean              "BOOLEAN" ; Synonym of TINYINT(1)
   :type/datetime             "TIMESTAMP"
   :type/datetime.date        "DATE"
   :type/datetime.time        "TIME"
   :type/number.float         "DOUBLE"
   :type/number.float.decimal "DECIMAL"
   :type/number.integer       "INTEGER"
   :type/number.integer.big   "BIGINT"
   :type/text                 "VARCHAR(254)"})

(defn- database->connection-details [_ context {:keys [database-name short-lived?]}]
  (merge {:host         "localhost"
          :port         3306
          :timezone     :America/Los_Angeles
          :short-lived? short-lived?
          :user         (if (env :circleci) "ubuntu"
                            "root")}
         (when (= context :db)
           {:db database-name})))

(defn- quote-name [_ nm]
  (str \` nm \`))

(extend MySQLDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:execute-sql!              generic/sequentially-execute-sql!
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))
          :load-data!                generic/load-data-all-at-once!
          :pk-sql-type               (constantly "INTEGER NOT NULL AUTO_INCREMENT")
          :quote-name                quote-name})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :mysql)}))
