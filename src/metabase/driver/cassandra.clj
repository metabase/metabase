(ns metabase.driver.cassandra
  "Cassandra Driver."
  (:refer-clojure :exclude [update])
  (:require [clojure.string        :as s]
            [clojure.tools.logging :as log]
            [cheshire.core         :as json]
            [toucan.db             :as db]
            [clojurewerkz.cassaforte.client :as cc]
            [clojurewerkz.cassaforte.cql   :refer :all]
            [clojurewerkz.cassaforte.query :refer :all]  
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :as table])
            [metabase.sync-database.analyze :as analyze]
            [metabase.util :as u]))

(defn -main [& args] 
  (println "Cassandra Driver")
  (let  [conn    (cc/connect ["127.0.0.1"])
         cluster (.getCluster conn)]
        ; (drop-keyspace    conn "demo" (if-exists))  ; in newest versions
        (try
          (drop-keyspace conn "demo")
          (catch Exception _ nil))
        (create-keyspace  conn "demo"
                              (with {:replication
                                    {"class"              "SimpleStrategy"
                                     "replication_factor" 1 }})
                              (if-not-exists))
        (use-keyspace conn "demo")
        (println "... disconnect")
        (cc/disconnect conn))
  )