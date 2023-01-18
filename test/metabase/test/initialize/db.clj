(ns metabase.test.initialize.db
  (:require
   [clojure.tools.logging :as log]
   [metabase.db :as mdb]
   [metabase.task :as task]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn init! []
  (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (#'task/set-jdbc-backend-properties!)
  (mdb/setup-db!)
  (log/info (t2/with-connection [^java.sql.Connection conn]
              (let [metadata (.getMetaData conn)]
                (u/format-color 'blue "Application DB is %s %s"
                                (.getDatabaseProductName metadata)
                                (.getDatabaseProductVersion metadata))))))
