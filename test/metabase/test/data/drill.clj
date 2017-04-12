(ns metabase.test.data.drill
  (:require [environ.core :refer [env]]
            (metabase.driver [generic-sql :as sql])
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u])
  (:import metabase.driver.drill.DrillDriver))

(def ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "DOUBLE"
   :type/Integer    "INTEGER"
   :type/Text       "TEXT"})

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:host "localhost"
          :port 10000
          :db "default"
          :user "admin"
          :password "admin"}))

(defn quote-name [nm]
  (str \` nm \`))

(defn default-create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial quote-name driver)
        pk-field-name (quot (generic/pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s);"
            (generic/qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (generic/pk-sql-type driver)
            pk-field-name)))

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:cluster "drillbits1"
          :zookeeper "localhost:2181/drill"}))

(u/strict-extend DrillDriver
                 generic/IGenericSQLDatasetLoader
                 (merge generic/DefaultsMixin
                        {:execute-sql!              generic/sequentially-execute-sql!
                         :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
                         :load-data!                generic/load-data-all-at-once!
                         :pk-sql-type               (constantly "INT")
                         :quote-name                (u/drop-first-arg quote-name)})
                 i/IDatasetLoader
                 (merge generic/IDatasetLoaderMixin
                        {:database->connection-details (u/drop-first-arg database->connection-details)
                         :default-schema               (constantly "default")
                         :engine                       (constantly :drill)}))
