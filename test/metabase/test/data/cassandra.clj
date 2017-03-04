(ns metabase.test.data.cassandra
  (:require [clojurewerkz.cassaforte.client :as cc]
            [clojurewerkz.cassaforte.cql    :as cql]
            [clojurewerkz.cassaforte.query :refer :all]
            [metabase.driver.cassandra]
            [metabase.driver.cassandra.util :refer [with-cassandra-connection]]
            [metabase.test.data.interface :as i]
            [metabase.util :as u])
  (:import metabase.driver.cassandra.CassandraDriver))

(defn- database->connection-details
  ([dbdef]
   (assert (some? dbdef) "Please provide database definition")
   {:dbname (i/escaped-name dbdef)
    :host   "localhost"
    ; TODO get port?
    })
  ([_ _ dbdef]
   (database->connection-details dbdef)))

(defn- destroy-db! [dbdef]
  (let [{:keys [host dbname]} (database->connection-details dbdef)]
       (with-open [cassandra-connection (cc/connect [host] {:port 9042})]
          (println "-- try destroy db")
          (println host)
          (println dbname)
          (println cassandra-connection)
          (try (cql/drop-keyspace cassandra-connection dbname)
               (catch Exception _ nil)))))

(defn- create-db! [{:keys [table-definitions], :as dbdef}]
  (println "---xx -- try create db")
  (destroy-db! dbdef)
  )

(u/strict-extend CassandraDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:engine                       (constantly :cassandra)
          :create-db!                   (u/drop-first-arg create-db!)
          :database->connection-details database->connection-details
          :format-name                  (fn [_ table-or-field-name]
                                          (if (= table-or-field-name "id")
                                            "_id"
                                            table-or-field-name))}))
