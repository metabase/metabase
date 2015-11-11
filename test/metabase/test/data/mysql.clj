(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require [clojure.string :as s]
            [environ.core :refer [env]]
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])))

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

;; MySQL's JDBC driver doesn't support executing multiple SQL statements at once
;; so split them up and execute them one-at-a-time
(defn- execute-sql! [loader context dbdef sql]
  (doseq [statement (map s/trim (s/split sql #";+"))]
    (when (seq statement)
      (generic/default-execute-sql! loader context dbdef statement))))

(defrecord MySQLDatasetLoader [])

(extend MySQLDatasetLoader
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:execute-sql!              execute-sql!
          :pk-sql-type               (constantly "INTEGER NOT NULL AUTO_INCREMENT")
          :quote-name                quote-name
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :mysql)}))


(defn dataset-loader []
  (->MySQLDatasetLoader))
