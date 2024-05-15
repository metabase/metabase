(ns metabase.test.initialize.db
  (:require
   [metabase.db :as mdb]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn init! []
  (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  (mdb/setup-db! :create-sample-content? false) ; skip sample content for speedy tests. this doesn't reflect production
  (log/info (t2/with-connection [^java.sql.Connection conn]
              (let [metadata (.getMetaData conn)]
                (u/format-color 'blue "Application DB is %s %s"
                                (.getDatabaseProductName metadata)
                                (.getDatabaseProductVersion metadata))))))
