(ns metabase.test.initialize.db
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.db :as mdb]
            [metabase.task :as task]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn init! []
  (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  (mdb/setup-db!)
  (log/info (jdbc/with-db-metadata [metadata (db/connection)]
              (u/format-color 'blue "Application DB is %s %s"
                              (.getDatabaseProductName metadata)
                              (.getDatabaseProductVersion metadata)))))
