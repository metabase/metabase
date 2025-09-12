(ns metabase-enterprise.dependencies.cmd
  (:require
   [environ.core :as env]
   [metabase-enterprise.dependencies.core :as deps]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn check-dependencies [path]
  (binding [mdb.connection/*application-db*
            (mdb.connection/application-db :h2
                                           (mdb.data-source/broken-out-details->DataSource
                                            :h2
                                            {:DB_CLOSE_DELAY -1
                                             :MVCC           true
                                             :DEFRAG_ALWAYS  true
                                             :LOCK_TIMEOUT   60000
                                             :db "mem:metabase"})
                                           :create-pool? true)]
    (mdb/setup-db! :create-sample-content? false)
    (serialization.cmd/v2-load-internal! path {} :require-initialized-db? false :token-check? false)
    (let [transform-ids (t2/select-fn-set :id :model/Transform)]
      (doseq [db-id (t2/select-fn-vec :id :model/Database)]
        (let [mp (lib-be.metadata.jvm/application-database-metadata-provider db-id)
              card-ids (t2/select-fn-set :id :model/Card :database_id db-id :archived false)]
          (println "Checking dependencies for database" db-id)
          (if (seq card-ids)
            (try
              (print (u/pprint-to-str
                      (deps/check-cards-have-sound-refs mp card-ids transform-ids)))
              (catch Throwable e
                (println "Checking dependencies for databaes" db-id "failed")
                (println (ex-message e))))
            (println "No cards found")))))))
