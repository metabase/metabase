(ns metabase.test.data.cassandra
  (:require (monger [collection :as mc]
                    [core :as mg])
            metabase.driver.mongo
            [metabase.driver.cassandra.util :refer [with-cassandra-connection]]
            [metabase.test.data.interface :as i]
            [metabase.util :as u])
  (:import metabase.driver.cassandra.CassandraDriver))

(defn- database->connection-details
  ([dbdef]
   (throw (ex-info "MJ - Need database->connection-details 1a....." {})))
  ([_ _ dbdef]
   (throw (ex-info "MJ - Need database->connection-details 1b ....." {}))))

(defn- destroy-db! [dbdef]
  (throw (ex-info "MJ - Need destroy-db! 1a....." {})))

(defn- create-db! [{:keys [table-definitions], :as dbdef}]
  (throw (ex-info "MJ - Need create-db! 1a....." {})))

(u/strict-extend CassandraDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:create-db!                   (u/drop-first-arg create-db!)
          :database->connection-details database->connection-details
          :engine                       (constantly :cassandra)
          :format-name                  (fn [_ table-or-field-name]
                                          (if (= table-or-field-name "id")
                                            "_id"
                                            table-or-field-name))}))
