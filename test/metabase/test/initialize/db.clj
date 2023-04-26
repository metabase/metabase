(ns metabase.test.initialize.db
  (:require
   [metabase.db :as mdb]
   [metabase.task.quartz-impl :as task.quartz-impl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn init! []
  (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
  (task.quartz-impl/set-jdbc-backend-properties!)
  (mdb/setup-db!)
  (log/info (t2/with-connection [^java.sql.Connection conn]
              (let [metadata (.getMetaData conn)]
                (u/format-color 'blue "Application DB is %s %s"
                                (.getDatabaseProductName metadata)
                                (.getDatabaseProductVersion metadata))))))
