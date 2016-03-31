(ns metabase.test.data.crate
  "Code for creating / destroying a Crate database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            metabase.driver.crate
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i]))
  (:import metabase.driver.crate.CrateDriver))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "long"
   :BooleanField    "boolean"
   :CharField       "string"
   :DateField       "timestamp"
   :DateTimeField   "timestamp"
   :DecimalField    "integer"
   :FloatField      "float"
   :IntegerField    "integer"
   :TextField       "string"
   :TimeField       "timestamp"})

(defn- database->connection-details [_ _ {:keys [_ _]}]
  (merge {:host         "localhost"
          :port         4300}))

(extend CrateDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:execute-sql!              generic/sequentially-execute-sql!
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))
          :pk-sql-type               (constantly "integer primary key")
          :create-db-sql             (constantly nil)
          :add-fk-sql                (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :crate)}))
