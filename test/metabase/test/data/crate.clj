(ns metabase.test.data.crate
  "Code for creating / destroying a Crate database from a `DatabaseDefinition`."
  (:require metabase.driver.crate
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i]))
  (:import metabase.driver.crate.CrateDriver))

(defn- database->connection-details [_]
  (merge {:host         "localhost"
          :port         4300}))

(extend CrateDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :crate)}))
