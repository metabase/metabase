(ns metabase.test.initialize.db
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.task.bootstrap :as task.bootstrap]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn init!
  "Set up the shared test app DB. Always the root [[mdb.connection/*application-db*]], whatever is bound when this is
  triggered: the initialized marker is global, so setting up a temporarily bound DB (e.g. inside `with-temp-empty-app-db`)
  would leave the shared one empty for every later test."
  []
  (binding [mdb.connection/*application-db* (.getRawRoot ^clojure.lang.Var #'mdb.connection/*application-db*)]
    (log/info (u/format-color 'blue "Setting up %s test DB and running migrations..." (mdb/db-type)))
    (task.bootstrap/set-jdbc-backend-properties! (mdb/db-type))
    (mdb/setup-db! :create-sample-content? false) ; skip sample content for speedy tests. this doesn't reflect production
    (log/info (t2/with-connection [^java.sql.Connection conn]
                (let [metadata (.getMetaData conn)]
                  (u/format-color 'blue "Application DB is %s %s"
                                  (.getDatabaseProductName metadata)
                                  (.getDatabaseProductVersion metadata)))))))
