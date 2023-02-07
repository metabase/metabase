(ns metabase.test.initialize.db
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.db :as mdb]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan.db :as db]))

(defn init! []
  (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  (mdb/setup-db!)
  (log/info (jdbc/with-db-metadata [metadata (db/connection)]
              (u/format-color 'blue "Application DB is %s %s"
                              (.getDatabaseProductName metadata)
                              (.getDatabaseProductVersion metadata)))))
