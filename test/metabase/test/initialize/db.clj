(ns metabase.test.initialize.db
  (:require [clojure.java.jdbc :as jdbc]
            [metabase
             [db :as mdb]
             [task :as task]
             [util :as u]]
            [toucan.db :as db]))

(defn init! []
  (println (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  (mdb/setup-db!)
  (jdbc/with-db-metadata [metadata (db/connection)]
    (println (u/format-color 'blue "Application DB is %s %s" (.getDatabaseProductName metadata) (.getDatabaseProductVersion metadata)))))
