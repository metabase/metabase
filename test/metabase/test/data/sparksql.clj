(ns metabase.test.data.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            [environ.core :refer [env]]
            (metabase.driver [generic-sql :as sql])
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i]
                                [hive :as hive])
            [metabase.util :as u]
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h])
            [metabase.util.honeysql-extensions :as hx])
  (:import metabase.driver.sparksql.SparkSQLDriver))

(def ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "DOUBLE"
   :type/Integer    "INTEGER"
   :type/Text       "STRING"})

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:host "localhost"
          :port 10000
          :db "default"
          :user "admin"
          :password "admin"}))

(defn default-create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial generic/quote-name driver)
        pk-field-name (quot (generic/pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s);"
            (generic/qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (generic/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (generic/pk-sql-type driver)
            pk-field-name)))

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:host "localhost"
          :port 10000
          :db "default"
          :user "admin"
          :password "admin"}))

(defn spark-quote-name [nm]
  (str \` nm \`))

(u/strict-extend SparkSQLDriver
                 generic/IGenericSQLDatasetLoader
                 (merge generic/DefaultsMixin
                        {:add-fk-sql                (constantly nil)
                         :execute-sql!              generic/sequentially-execute-sql!
                         :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
                         :create-table-sql          default-create-table-sql
                         :load-data!                (hive/make-load-data-fn generic/load-data-add-ids)
                         :pk-sql-type               (constantly "INT")
                         :quote-name                (u/drop-first-arg spark-quote-name)})
                 i/IDatasetLoader
                 (merge generic/IDatasetLoaderMixin
                        {:database->connection-details (u/drop-first-arg database->connection-details)
                         :default-schema               (constantly "default")
                         :engine                       (constantly :sparksql)}))
