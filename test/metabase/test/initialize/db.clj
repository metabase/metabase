(ns metabase.test.initialize.db
  (:require [metabase
             [db :as mdb]
             [task :as task]]))

(defn init! []
  (println (format "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  (mdb/setup-db!))
